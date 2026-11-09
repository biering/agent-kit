// Starter for the kinetic style: a 51 beat film at 134 BPM (22.8 s) about a made-up product.
// Swap the words, the palette and the title; keep the shape until it renders and `qa.mjs --style
// kinetic` passes, then change the blocks. Every time is a beat; the music's drop lands on beat 16
// (`music.start` comes from `beats.py --drop-beat 16`). A number on screen is the film's own
// ({frames}, {seconds}, {beats}) or has an entry in `sources`.
export default {
  title: 'PRODUCT',
  bpm: 134,
  beats: 51,
  fps: 60,
  palette: { bg: '#0A1A16', paper: '#ECEFE4', accent: '#7DF5C8', hot: '#FF4D8D', ink: '#0C1411' },
  music: { file: 'music/726.mp3', source: 'https://assets.mixkit.co/music/726/726.mp3', start: 7.226, gain_db: -6, stop_beat: 41 },
  sources: {},
  scenes: [
    // the opening: a point charges up, then one short claim per beat
    { block: 'Words', at: [0, 8], charge: true, shots: [
      { at: 1, style: 'punch3d', text: 'ONE', fx: 'punch' },
      { at: 2, style: 'slam', text: 'PAGE.', ground: 'accent' },
      { at: 3, style: 'stack', text: ['NO', 'EDITOR.'], ground: 'paper', in: 'whipX', second: 1, fx: 'hit' },
      { at: 5, style: 'split', text: ['JUST', 'CODE.'], in: 'whipY', second: 1, fx: 'punch' },
    ] },
    // the old way, struck out one by one
    { block: 'Strike', at: [8, 16], items: [
      { at: 8, word: 'KEYFRAMES.', ui: { type: 'timeline', title: 'untitled_cut', tag: 'WAITING' } },
      { at: 10.5, word: 'PRESETS.', ground: 'paper', ui: { type: 'tiles', tiles: [['SOFT', '◐', 'PRESET'], ['PUNCH', '▦', 'PRESET'], ['FILM', '≋', 'PRESET'], ['DUST', '☀', 'PRESET']] } },
      { at: 13, word: 'EXPORT QUEUES.', ui: { type: 'rack', rows: ['SERVER A', 'SERVER B', 'SERVER C'] } },
    ] },
    // the drop: cuts on the beat, the ground flipping with each
    { block: 'Words', at: [16, 24], shots: [
      { at: 16, style: 'cut', text: 'SNAP.', ground: 'accent', size: 520, rot: -3, fx: 'punch' },
      { at: 18, style: 'slam', text: 'IN TIME.', ground: 'paper', fx: 'hit', in: 'whipX' },
      { at: 21, style: 'cut', text: 'DONE.', ground: 'bg', color: 'accent', size: 560, fx: 'punch' },
    ], exit: { type: 'zoom', at: 23, char: 1, dur: 1 } },
    // the product name, in 3D
    { block: 'Hero', at: [24, 32], kicker: 'MADE FROM', title: 'HTML', sub: 'one file, no timeline' },
    // numbers the film can vouch for, because they are its own
    { block: 'Counters', at: [32, 41], counters: [
      ['{frames}', 'FRAMES, EACH ONE DRAWN BY CODE.'],
      ['{seconds}', 'SECONDS END TO END.'],
    ] },
    // the end card; the music cuts on its first beat
    { block: 'Logo', at: [41, 51], wordmark: 'PRODUCT', tagline: 'Your one-line promise goes here.', small: 'OUT TODAY' },
  ],
  captions: [],
}
