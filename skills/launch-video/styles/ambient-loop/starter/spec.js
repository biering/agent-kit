// The ambient-loop starter: 12 s at 30 fps, a flat ground and abstract shapes drifting over it, in
// colours with no brand in them. Every layer's cycle counts are whole numbers (drift kx and ky,
// breathe cycles, turns, flow), so the loop is seamless. Replace the palette and the layers; keep the
// rule until it renders and passes `qa.mjs --style ambient-loop`. No sound, no text, no call to action.
// At least one layer needs a sharp edge (a ring, a tile, a ribbon): a soft orb alone moves too gently
// for the loop to read as moving, and the QA counts it as held.
export default {
  title: 'Drift',
  seconds: 12,
  fps: 30,
  formats: ['header', 'search'],
  palette: { ground: '#10162B', ground2: '#171E3A', indigo: '#3F55E6', mint: '#2FA586', amber: '#F2B33D', coral: '#E5654A', paper: '#F4EFE6' },
  ground: 'ground',
  ground2: 'ground2',
  grain: 0.045,
  layers: [
    // big soft light: the slowest things, behind everything
    { kind: 'orb', color: 'indigo', at: [0.37, 0.5], size: 1.1, soft: 0.95, opacity: 0.9, blend: 'screen', drift: { kx: 1, ky: 2, rx: 0.08, ry: 0.06 }, breathe: { cycles: 2, amount: 0.05 } },
    { kind: 'orb', color: 'mint', at: [0.63, 0.56], size: 0.85, soft: 0.9, opacity: 0.7, blend: 'screen', drift: { kx: 2, ky: 1, rx: 0.07, ry: 0.08, ph: 1.4 }, breathe: { cycles: 1, amount: 0.07, ph: 2 } },
    { kind: 'orb', color: 'amber', at: [0.5, 0.3], size: 0.42, soft: 0.85, opacity: 0.5, blend: 'screen', drift: { kx: 3, ky: 2, rx: 0.05, ry: 0.05, ph: 3 } },
    { kind: 'orb', color: 'coral', at: [0.76, 0.34], size: 0.32, soft: 0.8, opacity: 0.5, blend: 'screen', drift: { kx: 1, ky: 3, rx: 0.04, ry: 0.04, ph: 4.2 } },
    // thin rings that breathe: the sharp edges that carry the motion
    { kind: 'ring', color: 'paper', at: [0.5, 0.5], size: 0.78, width: 0.003, opacity: 0.45, drift: { kx: 1, ky: 1, rx: 0.03, ry: 0.03 }, breathe: { cycles: 3, amount: 0.04 } },
    { kind: 'ring', color: 'paper', at: [0.5, 0.5], size: 0.52, width: 0.003, opacity: 0.3, drift: { kx: 2, ky: 1, rx: 0.035, ry: 0.02, ph: 2 }, breathe: { cycles: 2, amount: 0.05, ph: 1 } },
    { kind: 'ring', color: 'mint', at: [0.3, 0.7], size: 0.2, width: 0.008, opacity: 0.75, drift: { kx: 2, ky: 3, rx: 0.035, ry: 0.035, ph: 0.5 }, breathe: { cycles: 4, amount: 0.06 } },
    // a band of light flowing across, one wavelength carried along in the loop
    { kind: 'ribbon', color: 'paper', at: [0.5, 0.68], size: 0.05, amp: 0.09, waves: 2.2, flow: 1, opacity: 0.13, blend: 'screen' },
    // one tile turning once
    { kind: 'tile', color: 'amber', at: [0.7, 0.7], size: 0.16, radius: 0.28, width: 0.004, turns: 1, opacity: 0.55, drift: { kx: 1, ky: 2, rx: 0.025, ry: 0.025 } },
  ],
}
