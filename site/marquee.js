// The marquee: Matinee's own drawing, wide and narrow, laid into slide one so its bulbs chase; the stylesheet
// shows one. Its letter board already reads "Now showing" over "Whatever you're in the mood for". It imports
// nothing and the page loads it first, so the headline waits for no other script; both drawings are fetched at
// once and each laid in as it arrives, so neither screen waits on the drawing it does not show.
async function drawing(key) {
  const res = await fetch(`/static/marquee/marquee-${key}.svg`);
  if (!res.ok) throw new Error(`the marquee drawing ${key} answered ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml");
  const svg = document.importNode(doc.documentElement, true);
  svg.setAttribute("aria-hidden", "true");
  const frame = document.createElement("div");
  frame.className = `mq-frame mq-frame-${key}`;
  frame.append(svg);
  return frame;
}

for (const key of ["wide", "narrow"]) {
  drawing(key)
    .then((frame) => document.getElementById("marquee").append(frame))
    .catch((err) => console.warn("The marquee drawing could not be loaded.", err));
}
