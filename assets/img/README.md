# Product photos

Drop product images here. The chat recommendation cards and the "Product
details" modal both read them through `window.__IMAGE_MAP__`, set in
`index.html` just above the Zoe loader script tag.

Expected filenames (already wired — no code change needed once the files
exist):

| File            | Used for                                              |
|-----------------|-------------------------------------------------------|
| `valve.png`     | VRN2B valve + valve/actuator assembly recommendations |
| `actuator.png`  | MN7505 / MS7505 actuator recommendations              |

Any format the browser renders is fine (png / jpg / webp) — if you use a
different extension, update the map in `index.html` to match.

Until a file exists, the card falls back to the canonical Zoovu
placeholder image automatically (`onerror` handler in the engine's
`_buildRecCard`), so a missing photo degrades gracefully rather than
showing a broken image.

To add more distinct photos per SKU, add keys to the map: matching is a
case-insensitive substring test against the recommendation's `imageKey`
first, then its display name — so a key like `vrn2b006` would match the
3/4-inch valve specifically.
