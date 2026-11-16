# Example: Boxtrail

A full set from `compose-set.mjs`, for a fictional parcel tracker. Boxtrail, its
carriers, shops and parcels are made up. `preview.png` is the review sheet: the
set as the product page shows it, then with every word removed.

| Frame | Template | Headline | Job |
|---|---|---|---|
| 1 | `hero-object` | Know the day it *arrives* | The outcome. The parcel crosses into frame 2 |
| 2 | `panorama` | Watch it come *closer* | Same ground, a tilted device, the parcel's other half |
| 3 | `feature-callout` | Tell the house it's *coming* | One feature: the shared window, lifted off the screen |
| 4 | `before-after` | Paste a code, get a *date* | Codes pasted, parcels found: two real screens |
| 5 | `proof` | Private by *default* | No ratings yet, so honest specifics instead |

Render it from a folder where `sharp` and `fontkitten` resolve:

```bash
node <skill>/scripts/compose-set.mjs --spec <skill>/examples/boxtrail/set.json --sheet <scratch>/review.png
```

Frames land in `render/<size>/` (ignored by git).

- `caps/`: the app's screens at 1206x2622. A real app is captured from the
  simulator (SKILL.md, step 3). These were built in HTML (`app/screens.html`)
  and captured with `app/capture.mjs`, because the app does not exist.
- `art/parcel.svg`: the hero object, drawn for the example.
- `fonts/ArchivoBlack-Regular.ttf`: Archivo Black, under the SIL Open Font
  Licence (`fonts/OFL.txt`).
