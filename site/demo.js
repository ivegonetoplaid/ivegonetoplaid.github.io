// The demo's screens: the demo's player (site/player.js), from /demo/, in a frame at a screen's natural size,
// scaled to the drawn glass it stands in. The conductor (site/conductor.js) marks a frame live once its player
// has joined and shows what every other screen shows.

// Puts a demo into `glass`, at `width` x `height` (or the glass's own size when `natural`), `top` pixels below
// the glass's top (a drawn phone's status bar). Returns the frame.
export function mountDemo(glass, { width, height, top = 0, natural = false, title }) {
  const frame = document.createElement("iframe");
  frame.className = "demo-frame";
  frame.title = title;
  frame.src = "/demo/";
  if (!natural) {
    frame.width = String(width);
    frame.height = String(height);
    const fit = () => {
      const scale = glass.clientWidth / width;
      frame.style.transform = `translateY(${top * scale}px) scale(${scale})`;
    };
    new ResizeObserver(fit).observe(glass);
  }
  glass.prepend(frame);
  return frame;
}
