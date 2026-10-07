// The demo: Matinee's real page, from /demo/, in a frame at a screen's natural size, scaled to the drawn glass
// it stands in. The page opens on its front door; the demo opens the Guest profile there while the frame is
// hidden, so a visitor first sees the doors question, and does so again whenever the page returns to its door
// (after "Switch profiles", say). Nothing here changes Matinee's page.

// The guest's tile on the page's front door, once the door is up and its tiles can be pressed.
function guestTile(doc) {
  const stage = doc.getElementById("stage");
  if (!stage?.classList.contains("at-door")) return null;
  const tile = doc.querySelector(".seats .seat:not(.new)");
  return tile && !tile.disabled ? tile : null;
}

// Whether the page shows a walk's first screen: the doors, past the front door.
function atDoors(doc) {
  const stage = doc.getElementById("stage");
  return Boolean(stage && !stage.classList.contains("at-door") && doc.querySelector(".answers.many .letterbox"));
}

// Keeps the page past its front door: each time the door stands with the guest's tile, the tile is pressed while
// the frame is hidden, and the frame shows again once the doors question stands.
function keepPastDoor(frame, ready) {
  const doc = frame.contentDocument;
  let shown = false;
  frame.contentWindow.addEventListener("pagehide", () => frame.classList.remove("live"));
  const look = () => {
    const tile = guestTile(doc);
    if (tile) {
      frame.classList.remove("live");
      shown = false;
      tile.click();
      return;
    }
    if (!shown && atDoors(doc)) {
      shown = true;
      frame.classList.add("live");
      ready();
    }
  };
  new MutationObserver(look).observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  look();
}

// Puts a demo into `glass`, at `width` x `height` (or the glass's own size when `natural`), `top` pixels below
// the glass's top (a drawn phone's status bar), and resolves once a visitor can use it.
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
  // Every document the frame loads (a reload included) is kept past its front door.
  return new Promise((resolve) => {
    frame.addEventListener("load", () => keepPastDoor(frame, () => resolve(frame)));
  });
}
