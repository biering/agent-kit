// The kinetic starter: a 51 beat film at 134 BPM, 22.8 s. Replace the words, the palette and the
// name; keep the shape until it renders and passes `qa.mjs --style kinetic`, then change blocks.
// Every time is a beat. The music's drop is at beat 16 (music.start from beats.py --drop-beat 16).
// Numbers on screen are the film's own ({frames}, {seconds}, {beats}) or have an entry in `sources`.
export default {
  title: 'PRODUCT',
  bpm: 134,
  beats: 51,
  fps: 60,
  palette: { bg: '#0B1020', paper: '#F3EEE3', accent: '#FFC21A', hot: '#FF8A1F', ink: '#14120E' },
  music: { file: 'music/726.mp3', source: 'https://assets.mixkit.co/music/726/726.mp3', start: 7.226, gain_db: -6, stop_beat: 41 },
  sources: {},
  scenes: [
    // the hook: a point charges, then one idea per beat
    { block: 'Words', at: [0, 8], charge: true, shots: [
      { at: 1, style: 'punch3d', text: 'EVERY', fx: 'punch' },
      { at: 2, style: 'slam', text: 'FRAME', ground: 'accent' },
      { at: 3, style: 'stack', text: ['IS A', 'FUNCTION.'], ground: 'paper', in: 'whipX', second: 1, fx: 'hit' },
      { at: 5, style: 'split', text: ['OF', 'TIME.'], in: 'whipY', second: 1, fx: 'punch' },
    ] },
    // what it replaces
    { block: 'Strike', at: [8, 16], items: [
      { at: 8, word: 'TIMELINES.', ui: { type: 'timeline', title: 'sequence_final_edit', tag: 'EXPORTING' } },
      { at: 10.5, word: 'PLUGINS.', ground: 'paper', ui: { type: 'tiles', tiles: [['GLOW', '☀', 'PLUG-IN'], ['BLUR', '◐', 'PLUG-IN'], ['GRAIN', '▦', 'PLUG-IN'], ['TRAILS', '≋', 'PLUG-IN']] } },
      { at: 13, word: 'RENDER FARMS.', ui: { type: 'rack', rows: ['NODE A', 'NODE B', 'NODE C'] } },
    ] },
    // the drop: a run of cuts on the beat, the ground flipping on each
    { block: 'Words', at: [16, 24], shots: [
      { at: 16, style: 'cut', text: 'FAST.', ground: 'accent', size: 520, rot: -3, fx: 'punch' },
      { at: 18, style: 'slam', text: 'ON THE BEAT.', ground: 'paper', fx: 'hit', in: 'whipX' },
      { at: 21, style: 'cut', text: 'NOW.', ground: 'bg', color: 'accent', size: 600, fx: 'punch' },
    ], exit: { type: 'zoom', at: 23, char: 1, dur: 1 } },
    // the name, in 3D
    { block: 'Hero', at: [24, 32], kicker: 'WRITTEN IN', title: 'CODE', sub: 'one web page' },
    // the numbers come from the film itself
    { block: 'Counters', at: [32, 41], counters: [
      ['{frames}', 'FRAMES. ALL CODE.'],
      ['{seconds}', 'SECONDS OF FILM.'],
    ] },
    // the end card; the music stops dead on its first beat
    { block: 'Logo', at: [41, 51], wordmark: 'PRODUCT', tagline: 'One line that says what it does.', small: 'AVAILABLE NOW' },
  ],
  captions: [],
}
