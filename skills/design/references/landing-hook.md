# The hook

Read this after `landing-page.md` has settled the offer and before the taste run's motion pass.
A landing page gets one hook: the thing on the first screen that moves or answers, and that a
visitor would describe an hour later. `taste/references/motion.md` calls it the signature moment
and has the recipes. This file gives it a job, a budget and a way to check it.

A static first screen is a mock-up. A first screen that moves without saying anything is
decoration. The hook is neither: it shows the page's claim happening.

## 1. The job

Write one sentence before building: "The hook shows [the claim] by [what the visitor sees]."
If the sentence works with the product name swapped for a competitor's, the hook is decoration.

| Claim | A hook that carries it | Decoration |
|---|---|---|
| The listed return hides what the loan costs | A house whose floors part to show the monthly figure | A rotating house |
| Every object gets an honest number | A small city where each building receives its figure in turn | A city that only glows |
| The buyer can check the numbers | A calculator whose slider moves and whose result changes | A dashboard screenshot that fades in |

## 2. Three ways to earn the click

Pick one per page. Two pages for the same ad may differ only in this, which makes it a clean test.

| Mechanic | The visitor | Fits |
|---|---|---|
| **Show** | watches the claim happen, no effort | cold traffic from a feed, where the page continues the ad's picture |
| **Start** | does the first step of the product on the page: pastes a link, types an amount | warm and search traffic. The account comes after the first result [12] [13] |
| **Play** | drags a control and sees a personal result | curious traffic, and products whose value is a number that depends on the visitor |

Numbers in brackets are rows in `landing-evidence.md`. For Start and Play the evidence is case
studies, not experiments: treat them as hypotheses and measure.

A hook that plays by itself until the visitor touches it works for all three: it shows first and
invites second.

## 3. The budget

No controlled experiment shows that a hero animation lifts conversion. Speed does [2] [3] [4].
So the hook may never cost the first screen its speed.

- **Text first.** Headline, supporting line and the action render before the hook loads. The
  largest contentful paint is text or a small image, never the hook.
- **Load late.** A 3D library, a video or a large image loads after first paint: on idle or when
  the hook scrolls near. The slot has its final size from the start, so nothing shifts.
- **Stay small.** Prefer CSS and inline SVG. A canvas or WebGL scene is fine when it is the
  claim; then it gets a pixel-ratio cap of 2, pauses when off screen and stops when the tab is
  hidden.
- **Reduced motion keeps the content.** With `prefers-reduced-motion` the hook rests in its
  most telling state: the floors already parted, the figures already shown.
- **A fallback that is still a picture.** No WebGL, no script, a slow phone: a still of the same
  scene, not an empty box.
- **One hook.** A second moving thing on the first screen competes with the first. Below the
  fold, ordinary section entrances from the motion guide are enough.
- **Example figures are labelled** as examples, come from one consistent case and match the
  headline.

## 4. Stay in the house

A hook lives in the product's existing look. When exploring, a new look is a variation shown
beside the current one, never a replacement that arrives unasked. A picture or a motion idea
that fits can be carried into the house look; a foreign palette and type cannot.

Show early. Publish the first working version of the page before polishing the second one: a
direction that is wrong is cheaper to learn from one page than from four.

## 5. Check it

Motion cannot be judged from source. Look at it:

1. Frames at about 1 s and 6 s after load, at 1440 and at 390 wide. At 1 s the page must already
   read. At 6 s the hook must have said its sentence.
2. The first phone screen holds the headline, the action and at least the start of the hook.
3. With reduced motion: the resting state from section 3, and nothing missing.
4. Controls: drag or type, and read the numbers back from the page. They must match the
   arithmetic of the stated example.
5. No horizontal scroll at 320 wide. Tap targets at least 44 px [17].
6. Throttle to a slow phone once. If the headline waits for the hook, the load order is wrong.

## 6. What goes wrong

- **The hook explains nothing.** It passes every check and the visitor still cannot say what the
  product does. Go back to the sentence in section 1.
- **The figure covers the thing it labels.** Place the label beside the moving part.
- **The result reads on a desktop and not on a phone.** Text inside a scaled drawing shrinks
  with it. Put figures in the page, not in the picture, below about 640 wide.
- **A claim sneaks in through the demo.** An example that shows hourly alerts promises hourly
  alerts. The demo is copy: check it against the product like every other sentence.
