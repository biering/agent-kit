# Six layout templates

`scripts/compose-set.mjs` renders these. A set picks one per frame; the
example in `examples/boxtrail/` uses all six in one set, with the copy at the top
and at the bottom, and its review sheet is `examples/boxtrail/preview.png`.

They come from what strong sets share. A board of four (Halo AI, Sermon Scribe,
ReminderOS, Zulachat, November 2026) and the sets in `concepts.md` all do the
same few things:

- **One benefit headline per frame, three to six words, set huge.** Often one
  word is emphasised: a filled box behind "Paid", a colour change. The headline
  is the largest thing on the frame, larger than the device.
- **One strong brand colour, or a themed ground,** held across the set. Sets
  alternate two grounds at most (dark and light of the same family).
- **The device is not a neat upright rectangle.** It is tilted, oversized, cut
  by the frame edge, held in a hand. That makes the frame look composed rather
  than generated.
- **A hero object carries the idea:** a paper plane, a calendar page, scissors,
  a church. It is bigger than life and often crosses into the next frame, so
  the first frames read as one picture.
- **Frame 1 sells the outcome; each later frame shows one feature.**
- **Real UI in the device,** never a wall of text, never a mockup.
- **Overlays of money or social proof only where honest.** Zulachat's floating
  "+$439" chips are the risky end of this: an earnings claim and other
  platforms' logos, both of which need care (see "Honesty" below).

## Choosing

| Frame's job | Template | Reach for it when |
|---|---|---|
| Sell the outcome (frame 1) | `hero-object` | An object stands for the outcome (a parcel that arrives, a plane that sends) and the app owns art of it |
| Sell the outcome (frame 1) | `tilted-device` | The outcome is visible on one screen, and there is no object |
| Carry frame 1 into frame 2 | `panorama` | Frames 1 and 2 should read as one scene; something crosses the seam |
| Show one feature | `feature-callout` | One element on the screen *is* the feature (the ETA, the price, the voice picker) |
| Show the change | `before-after` | The app turns a mess into order; both states are real screens of the app |
| Make it believable | `proof` | A sourced rating or review exists, or the honest specifics are the selling point |

The first three frames are what search shows, so they work as a group: outcome,
how, proof (`SKILL.md`, step 1). A common honest order is `hero-object`,
`panorama`, `feature-callout`, then one feature per frame, with `proof` third or
last.

## The templates

Every frame takes `headline` (with one `*emphasised*` word or phrase), an
optional one-line `sub`, `copy: "top" | "bottom"`, `align: "center" | "left"`,
and its own `background`, `ink`, `subInk`. Placements (`device`, `object`,
`before`, `after`) take `x`, `y` (the centre, in artboard units: each frame is
430 wide and about 934 tall), `width` and `rotate` in degrees. Every default
below can be overridden per frame.

**Copy at the bottom.** The defaults below are for copy at the top. With
`"copy": "bottom"` every default height is mirrored (`y` becomes `934 - y`), so
the device hangs from the top edge and shows its lower part; a `y` the frame
sets itself is kept. Pick the screen with that in mind, or set `y`.

**Nothing covers the words.** A device or object that overlaps a headline, a
sub-line or a proof block is refused with an error naming the frame (the turned
shape is tested, not its bounding box). Move it, shrink it or set the copy at
the other end.

### `hero-object`

The outcome headline, one large object, and a tilted device behind it.

- `object.image`: a PNG with transparency or an SVG **the app owns**: its own
  illustration, a 3D render made for it, or art drawn for it. Not stock clip
  art, not an emoji, not another brand's product.
- The object may cross the right edge into frame 2; that is the panorama. Cut
  it where the gap will not hurt (the side of the box, not the label).
- Defaults: object at (215, 640), 330 wide, -8°; device at (290, 700), 250 wide,
  -12°.

### `tilted-device`

One oversized device, turned and cut by the frame's edge. The default "it
looks designed" frame.

- 6° to 12° reads as deliberate; under 4° reads as a mistake; over 15° makes
  the screen hard to read, and is refused for every device (objects may turn as
  they like).
- The device is cut by its own frame and never shows a sliver in the neighbour.
  `device.bleed: true` lets it cross, and the compositor warns, because the
  store draws a gap between frames that would cut the screen in half.
- Defaults: (235, 650), 330 wide, -9°.

### `panorama`

Continues the frame before it: the same ground (forced), and something that
crosses the seam. The device itself stays inside the frame; the **ground and an
object** carry the continuity.

- The store shows frames as separate rounded cards with a gap between them,
  and Apple does not publish its width. So: headlines, devices and faces stay
  inside each card; let the ground and an object cross
  (`store-practice.md` §3).
- Each panorama frame still stands alone in search; its headline must make
  sense without the frame before it.
- Defaults: device at (245, 650), 320 wide, 8° (leaning the other way from frame 1).

### `feature-callout`

An upright device with the one element that *is* the feature cut from the real
capture, enlarged and lifted off the screen.

- `callouts: [{ "crop": [x, y, w, h], "scale": 1.2, "shift": [dx, dy], "rotate": -3 }]`,
  crop in capture pixels, shift in artboard units.
- The callout is a piece of the real screen, never redrawn UI (guideline 2.3.3).
- Defaults: device at (215, 680), 310 wide, upright.

### `before-after`

Two real screens of the app: before (muted to grey) and after (in colour), each
labelled.

- Both states are the app: the codes pasted and the parcels found, the inbox
  and the sorted list, the blank form and the filled one.
- The "before" is never a named competitor, another app's UI or a staged
  screenshot of a rival. Keep it generic and the app's own.
- `labels: { "before": "Pasted", "after": "Found" }`; the defaults are Before
  and After. Short labels in the user's words beat the defaults.
- Defaults: before at (140, 665), 222 wide, -6°; after at (287, 640), 236 wide, 4°.

### `proof`

Why believe it. One of:

- `badge: { "value": "4.8", "label": "on the App Store", "source": "App Store Connect, 4.8 from 212 ratings, <date>" }`,
- `quote: { "text": "<the reviewer's words>", "author": "<name>", "source": "App Store review, <date>" }`,
- `facts: ["No account", "Stays on your phone", "No ads, no trackers"]`: honest
  specifics, the proof a new app has.

A badge or quote without a `source` is refused, and a fact with a number in it
is refused (a figure goes in a sourced badge). Sizes are fixed, so keep them
short: a badge `value` is the figure alone, such as "4.8", and its `label` a few
words ("on the App Store"); a quote
is one line, about 30 characters, and a longer one is refused rather than
shrunk. Cut the reviewer's words to the sentence that carries the point, without
changing what they meant. Give it `"device": { "screen" }`
and a device peeks in from the bottom at (215, 845), 300 wide (the screen that
backs the claim, such as the privacy settings); without one the frame is type
alone.

## Stickers

Any frame takes `stickers: [{ "text", "x", "y", "rotate", "fill", "ink", "source" }]`:
short floating chips over the scene, the "6 stops away" or "+$439" kind. Text
with money, a percentage, a multiplier, a user count or a rating needs a
`source`. Use them for state that is really in the app; two per frame at most.

## Set-level settings

- `emphasis: "pill" | "colour"`: the emphasised word on a filled, slightly
  turned pill (`pill`, `pillInk`, `pillRotate`), or in the `accent` colour.
- `headlineSize: "set" | "frame"`: `set` (the default) gives every headline the
  same type size, the largest at which every headline fits three lines. Frames
  then differ in line count, not in type size, which is what makes a set read
  as one.
- `font`, `bodyFont`: `.ttf` files; set as outlines, so the render does not
  depend on an installed font.

## Where this departs from the design skill's house rules

The design skill (`design`, taste guide) bans a styled accent word and resting
shadows on web pages. Store frames are a different medium, judged at thumbnail
size next to competitors:

- **One emphasised word per headline is allowed** because the store convention
  uses it to carry the outcome at thumbnail size. One, never two.
- **Devices, callouts and stickers cast a soft shadow** because they float over
  the ground; nothing at rest has one.

Everything else holds: one ground, one ink, one accent; type set larger before
anything else is added; no gradients, no glass, no emoji in the copy; no fake
UI; and look at the render before calling it done.

## Honesty

What the validator refuses, in every headline, sub-line, label, fact and
sticker:

- **Apple's own recognitions and ranks:** Editor's Choice, App of the Day, Apps
  we love, Apple Design Award, "#1", "best app". Apple applies real badges
  itself (guideline 5.2.4).
- **Prices and amounts of money** without a source, and never in a headline
  (guidelines 2.3.7 and 2.3.14).
- **Measured claims without a source:** percentages, "3x faster", "three times
  faster", "twice as fast", "100K+ users", star ratings.
- **URLs and ©, ® or ™.**
- **Words that would not read:** headline, sub-line, emphasised word, pill and
  proof marks under 3:1 contrast with what they sit on (WCAG's minimum for large
  text). A lime accent on a near-white ground fails; use `"emphasis": "pill"`
  there, or a darker accent.
- **A screen that is not a capture:** a device's `screen` must be a portrait
  iPhone capture (about 0.46 wide to 1 tall, opaque). A composed image or a
  landscape shot would be squeezed into the device.

What it cannot see, and the review must:

- **No invented reviews, earnings or ratings.** The FTC's rule on fake reviews
  (in force since 21 October 2024) covers testimonials in your own marketing,
  and an earnings figure needs to be what a typical user gets, not the best
  case. A "+$439" chip is honest only if it is a real payout, shown with how
  typical it is.
- **No other platforms' names, icons or logos** (2.3.10): no row of TikTok,
  Instagram or Android logos, even when the app works with them.
- **A drawn device carries no Apple-only details:** no island, notch, home
  button or switches; the compositor's device has none. Apple's own bezels may
  not be tilted or cropped, so a tilted device is always the generic one.
- **4+ in every frame,** whatever the app's rating (2.3.8).
