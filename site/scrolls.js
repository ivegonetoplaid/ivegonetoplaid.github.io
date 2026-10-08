// Whether a wheel of `dy` scrolls something under `el` inside its own document: a box that scrolls on its own,
// overflowing by more than 8 px, with room left to scroll that way.
export function scrollsHere(el, dy) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const style = n.ownerDocument.defaultView.getComputedStyle(n);
    if (!/(auto|scroll)/.test(style.overflowY) || n.scrollHeight - n.clientHeight <= 8) continue;
    if (dy > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
  }
  return false;
}
