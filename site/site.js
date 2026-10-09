// The site's page: the deck over the curtain and About over everything. The marquee loads on its own (marquee.js).
import { deck } from "./deck.js";
import { conductor } from "./conductor.js";
import { mountDemo } from "./demo.js";


// An overlay (About, the phone's demo) opens as a history step, so the browser's Back closes it; while open it
// takes the wheel, the keys and the touch. Its own close steps back over every history step taken since it
// opened, the demo's own included (Matinee's About inside it adds one), so the page is left as it was.
function overlay(layer, opener, first) {
  let start = 0;
  const close = () => {
    if (layer.hidden) return;
    layer.hidden = true;
    opener.focus();
  };
  const open = () => {
    layer.hidden = false;
    history.pushState({ overlay: layer.id }, "");
    start = history.length;
    first.focus();
  };
  const back = () => {
    if (layer.hidden) return;
    const steps = history.length - start + 1;
    close();
    history.go(-steps);
  };
  addEventListener("popstate", close);
  return { open, back, isOpen: () => !layer.hidden };
}

const about = overlay(document.getElementById("about"), document.getElementById("open-about"), document.getElementById("close-about"));
document.getElementById("open-about").addEventListener("click", about.open);
document.getElementById("close-about").addEventListener("click", about.back);
document.getElementById("about").addEventListener("click", (e) => {
  if (e.target.id === "about") about.back();
});
// The phone's demo: Matinee full screen, with the site's own chip to leave it. Its frame is made the first time
// it opens, and kept, so a second visit finds the demo as it was left.
const demo = overlay(document.getElementById("demo"), document.getElementById("open-demo"), document.getElementById("close-demo"));
let fullScreen = null;
function openDemo() {
  fullScreen ??= mountDemo(document.getElementById("full-glass"), { natural: true, title: "Matinee, full screen" });
  demo.open();
}
document.getElementById("open-demo").addEventListener("click", openDemo);
document.querySelector(".handset").addEventListener("click", () => {
  if (!wideScreen()) openDemo();
});
document.getElementById("close-demo").addEventListener("click", demo.back);

addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (demo.isOpen()) demo.back();
  else if (about.isOpen()) about.back();
});

deck({
  slides: [...document.querySelectorAll(".slide")],
  dots: [...document.querySelectorAll(".dots button")],
  busy: () => about.isOpen() || demo.isOpen(),
});

// The demo's two screens: a phone always, and a desktop monitor where the screen is wide enough to show one.
const wide = matchMedia("(min-width: 601px)");
function wideScreen() {
  return wide.matches;
}
const STATUS_BAR = 58; // the drawn phone's status bar, in the phone's own pixels
window.demoConductor = conductor(); // every screen's player finds it here before its first press
mountDemo(document.getElementById("phone-glass"), { width: 390, height: 844 - STATUS_BAR, top: STATUS_BAR, title: "Matinee on a phone" });
// A window that widens past a phone's width gets its monitor's demo then, once; it joins where the phone stands.
function mountDesk() {
  wide.removeEventListener("change", mountDesk);
  mountDemo(document.getElementById("desk-glass"), { width: 1680, height: 1050, title: "Matinee on a desktop" });
}
if (wide.matches) mountDesk();
else wide.addEventListener("change", mountDesk);
