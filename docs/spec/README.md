---
purpose: Index of the demo site's specifications — what each spec covers and how to read it against the code.
updated: 2026-10-07
---

# Demo site specs

Each document here states the contract the site holds to: what it does, what
it refuses, and where each part lives.

## How to read these

A spec holds two kinds of claim. The **contract** says what the site must do
and must refuse, and it is authoritative. The **map** says where each part
lives; it is a pointer, never proof. A change to behaviour amends the spec in
the same commit as the code. When the spec and the code disagree, ask which
moved last. If the spec moved last, the code is wrong. If the code moved last,
the spec is behind and owes an amendment.

## The specs

- [`demo-site.md`](demo-site.md) — the whole site: the deck and its gestures,
  the three slides and the About, the demo (the copy of Matinee's page, the
  stand-in and its canned replies, the frames past Matinee's front door, the
  mirror between two screens, the phone's full-screen demo), the canned-walk
  builder, what the site fetches, the tests and the gate, and the shapes of the
  files other programs read. Written from the code on 2026-10-07. It ends with
  its known limits and a map of handles.

Matinee's own page is specified in the Matinee repository, in
`docs/spec/matinee.md`.
