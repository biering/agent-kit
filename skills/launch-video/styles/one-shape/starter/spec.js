// The one-shape starter: a 28 beat film at 120 BPM, 14 s, one pill that becomes a field, a loader,
// a check, a card and a pill again. Replace the words, the palette and the sizes; keep the
// structure until it renders and passes `qa.mjs --style one-shape`, then change states.
// Sizes are px on a 1080 frame. A press needs a pointer, a flood needs a new ground; the last state
// equals the first so the film loops. Music: Mixkit 22 at 120.01 BPM, its first downbeat at 0.413 s.
export default {
  title: 'Start',
  bpm: 120,
  beats: 28,
  fps: 30,
  palette: { paper: '#F4EFE6', ink: '#1B1A17', mint: '#2FA586' },
  music: { file: 'music/22.mp3', source: 'https://assets.mixkit.co/music/22/22.mp3', start: 0.413, gain_db: -8, fade_out: 1.2 },
  sources: {},
  states: [
    // 0 = the last state: a pill on paper
    { beat: 0, size: [380, 132], radius: 'pill', color: 'ink', ground: 'paper', kind: 'label', label: 'Start', note: 'One button.' },
    // the pointer arrives a beat early, presses beside the label and not on it; the pill opens into a field and types
    { beat: 3, press: [125, 0], size: [860, 132], kind: 'field', text: 'Plan a weekend by the river', note: 'Say what\nyou want.' },
    // the send chip stands half a field height in from the right edge: dx = w / 2 - h / 2 = 364
    { beat: 8, press: [364, 0], size: [190, 190], color: 'mint', kind: 'ring', note: 'It works\non it.' },
    // nothing presses this: the loader is done, and its colour pours out as the next ground
    { beat: 11, flood: true, ground: 'mint', color: 'paper', size: [200, 200], kind: 'check', note: 'Done.' },
    { beat: 13.5, press: [52, 52], size: [420, 132], kind: 'label', label: 'Open', note: 'Open it.' },
    { beat: 16.5, press: [135, 0], size: [820, 400], radius: 48, kind: 'card', label: 'Your weekend', rows: ['Walk the old town', 'Lunch by the river', 'Sunset at the viewpoint'], note: 'Here is\nyour plan.' },
    { beat: 21, press: [250, 30], size: [340, 116], radius: 'pill', kind: 'label', label: 'Saved', note: 'Saved.' },
    // the paper pours out of the pill and the ink pill is back: the last state equals the first
    { beat: 23.5, flood: true, ground: 'paper', color: 'ink', size: [380, 132], kind: 'label', label: 'Start', note: 'One button.' },
  ],
}
