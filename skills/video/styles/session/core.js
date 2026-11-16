// The arithmetic of a session film, free of the page: how a second and a pixel of the take become a
// frame and a place in the film. engine.js draws by these, scripts/take.mjs writes the take they
// read, and test/video-session.test.mjs holds them to their rules. Nothing here touches the DOM.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

// A stretch says "sped up" on screen from this speed up. Above 1 only by what reading a moment off
// a contact sheet can be wrong by: a stretch at 1.05 was recorded at that speed.
export const FAST = 1.1

/** The frame (f00001.jpg is 1) that shows second `seconds` of the recording. The ingest wrote frame n from what the screen showed at from + (n - 1) / fps. */
export const frameAt = (take, seconds) => clamp(Math.round((seconds - take.from) * take.fps) + 1, 1, take.frames)

/** A rect [x, y, w, h] measured on the recording, where it stands in a window `win` ({ x, y, w }) that shows the take's crop across its whole width. */
export function inWindow(take, [x, y, w, h], win) {
  const k = win.w / take.crop[2]
  return { x: win.x + (x - take.crop[0]) * k, y: win.y + (y - take.crop[1]) * k, w: w * k, h: h * k }
}

/**
 * sync: [[film second, second of the recording, own?], ...] in film order. The second of the
 * recording that stands at film second t: held before the first and after the last, and between two
 * of them the take runs at whatever speed fits.
 */
export function takeTime(sync, t) {
  if (t <= sync[0][0]) return sync[0][1]
  for (let i = 1; i < sync.length; i++) {
    if (t <= sync[i][0]) return sync[i - 1][1] + ((sync[i][1] - sync[i - 1][1]) * (t - sync[i - 1][0])) / (sync[i][0] - sync[i - 1][0])
  }
  return sync[sync.length - 1][1]
}

/**
 * The stretches of film time that play at least FAST times faster than they were recorded,
 * neighbours joined: [[from, to], ...]. `own` on an entry marks the stretch that ENDS there as the
 * user's own pace (typing, the pause before Enter): it claims nothing about the product.
 */
export function fastStretches(sync) {
  const all = []
  for (let i = 1; i < sync.length; i++) {
    const [t0, m0] = sync[i - 1]
    const [t1, m1, own] = sync[i]
    // two entries on one beat have no speed: that is not fast either
    if (own || !((m1 - m0) / (t1 - t0) >= FAST)) continue
    if (all.length && all.at(-1)[1] === t0) all.at(-1)[1] = t1
    else all.push([t0, t1])
  }
  return all
}

/**
 * The camera [zoom, x, y] that shows rect `r` `fill` of the safe area `S` wide or high, in a W x H
 * frame; (x, y) is the world point at the frame's centre. `r` sits in the middle of the safe area
 * unless that would show the ground beside the window `win`: the safe area stays inside the window
 * on every axis the window is big enough to fill, and is centred on it where it is not.
 */
export function frameRect(r, fill, S, win, W, H) {
  const z = fill * Math.min(S.w / r.w, S.h / r.h)
  const axis = (mid, size, lo, hi, off) => {
    const half = size / z / 2
    return (hi - lo <= half * 2 ? (lo + hi) / 2 : clamp(mid, lo + half, hi - half)) - off / z
  }
  return [z, axis(r.x + r.w / 2, S.w, win.x, win.x + win.w, S.x + S.w / 2 - W / 2), axis(r.y + r.h / 2, S.h, win.y, win.y + win.h, S.y + S.h / 2 - H / 2)]
}
