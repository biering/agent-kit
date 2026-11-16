// The product-ui starter: a 36 beat walkthrough at 114 BPM, 18.9 s. A request is typed, shared with a
// toggle and started; a checklist completes row by row; a result card grows out of the last row; the
// pointer goes to a second tab. Replace the screen in film.html with the product's, the targets with
// its ids, the words with its own; keep the shape until it renders and passes
// `qa.mjs --style product-ui`. Every beat is on the quarter. The music starts on beat 0
// (music.start from beats.py: 20.927 s is the downbeat of a steady stretch of the track).
// A number on screen is the product's own and has an entry in `sources`; this starter shows none.
export default {
  title: 'PRODUCT',
  bpm: 114,
  beats: 36,
  fps: 60,
  pointer: 'arrow',
  music: { file: 'music/568.mp3', source: 'https://assets.mixkit.co/music/568/568.mp3', start: 20.927, gain_db: -6, fade_out: 0.4 },
  sources: {},
  targets: ['#form', '#ask', '#share', '#start', '#progress', '#checks', '#r4', '#result', '#right', '#tab-reports', '#list', '#new-report'],
  steps: [
    // the form: the camera comes in on it, the pointer clicks the field, the request is typed
    { beat: 0, do: 'caption', text: 'Ask in plain words' },
    { beat: 0, do: 'camera', to: '#form', zoom: 1.45, at: [0.5, 0.6], dur: 3 },
    { beat: 1, do: 'move', to: '#ask', at: [0.5, 0.9], dur: 2 },
    { beat: 3, do: 'press' },
    { beat: 3.5, do: 'type', into: '#ask', text: "Sum up this week's feedback, flag urgent ones", cps: 12 },
    // who sees it, then start: the button wakes once the text is complete
    { beat: 10.5, do: 'caption', text: 'Choose who sees it' },
    { beat: 10.75, do: 'move', to: '#share', dur: 2 },
    { beat: 12.75, do: 'toggle', target: '#share' },
    { beat: 14.25, do: 'move', to: '#start', at: [0.7, 0.75], dur: 2 },
    { beat: 16.25, do: 'press' },
    // the task runs: the camera follows it to the checklist, which completes row by row
    { beat: 16.25, do: 'caption', text: 'Every step shows as it finishes' },
    { beat: 16.5, do: 'camera', to: '#progress', zoom: 1.4, dur: 2.5 },
    { beat: 16.5, do: 'run', target: '#checks', rows: 4, every: 1.25 },
    // the result grows out of the last row; the frame widens to hold both cards
    { beat: 22.25, do: 'caption', text: 'The result lands beside it' },
    { beat: 22.25, do: 'result', target: '#result', from: '#r4' },
    { beat: 22.25, do: 'camera', to: '#right', zoom: 1.2, dur: 2.5 },
    // the second tab: the pointer goes, clicks, the page changes
    { beat: 25, do: 'move', to: '#tab-reports', dur: 2 },
    { beat: 27, do: 'press' },
    { beat: 27.25, do: 'switch', tab: 'reports' },
    { beat: 27.25, do: 'caption', text: 'Saved with the rest' },
    // the end card: the frame rests on the list and the pointer on the new report
    { beat: 29.5, do: 'move', to: '#new-report', at: [0.72, 0.5], dur: 2 },
    { beat: 29.5, do: 'camera', to: '#list', zoom: 1.4, dur: 2.5 },
  ],
}
