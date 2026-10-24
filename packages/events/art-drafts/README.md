# Weekly art drafts, Fall 2026

Three hand-made options, each a picture (`<name>.txt`) and a same-shaped mask (`<name>.mask.txt`)
where `1`-`9`, `a`, `b` name the eleven weeks (Sep 7 to Nov 16) and a space is scenery.

- `python3 build-drafts.py` rebuilds the picture and mask files from the stamps.
- `node art-preview.mjs [outDir]` writes `preview.html` (default `/tmp/d3`): every draft with both
  empty-week treatments, frost and left out.
- `node art-preview.mjs --emit <name>` prints the `art` object `semesters.json` takes.

Shipped: A, the paw trail, with frost. The treatment is `emptyWeeks` in `src/data/semesters.json`
(`"frost"` or `"omit"`); picking the other is a one-line change.
