// A static server for the tests that answers as GitHub Pages does: each file by its extension's type, a file
// with no extension as application/octet-stream, "nosniff" on every reply, every reply kept 10 minutes
// ("max-age=600"), a directory by its index.html. It counts the requests that reach it, by path.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

async function fileFor(path) {
  const full = normalize(join(ROOT, decodeURIComponent(path)));
  if (!full.startsWith(ROOT)) return null;
  try {
    const info = await stat(full);
    return info.isDirectory() ? join(full, "index.html") : full;
  } catch {
    return null;
  }
}

// Starts the server on a free port and resolves to its origin and a stop function.
export async function serve() {
  const hits = new Map();
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    hits.set(path, (hits.get(path) || 0) + 1);
    const file = await fileFor(path);
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "max-age=600",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { origin: `http://127.0.0.1:${server.address().port}`, hits, stop: () => new Promise((ok) => server.close(ok)) };
}
