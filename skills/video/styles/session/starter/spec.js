// The session starter: 56 beats at 123.64 BPM, 27.2 s. An assistant is asked for the week's open
// tasks, calls the product's tool and answers with the product's card; the camera follows the
// composer, the tool call, the answer and its rows, a line is drawn around the status column, the
// pill floods into the end card, and the agents turn in its slot. Replace the copy, the session
// (session.json, card.html), the agents and the mark with the film's own; keep the shape until it
// renders and passes `qa.mjs --style session`. The music starts so its drop is beat 24: the result.
// A number on screen is the product's own and has an entry in `sources`; this starter shows none.

// Neutral placeholders, 24 x 24. A film passes the real clients' logos it may use, from its own folder.
const BUBBLE = 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'
const SPARK = 'M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z'

export default {
  title: 'PRODUCT',
  bpm: 123.64,
  beats: 56,
  fps: 60,
  music: { file: 'music/471.mp3', source: 'https://assets.mixkit.co/music/471/471.mp3', start: 4.006, gain_db: -6, fade_out: 1.6 },
  sources: {},
  // the hook rises, its full stop pops, the hook leaves, the stop grows into the window, the last
  // caption leaves, the pill floods the frame, the end card
  at: { hook: 0.5, dot: 3.4, hookOut: 5.6, window: 6, pillOut: 43, flood: 43.5, end: 44.6 },
  // [beat, moment of the take]: session.json's `at` is drawn at the film's pace (these beats from
  // second 1), so no stretch plays faster than it was drawn and none says "sped up"
  sync: [[8, 'promptStart'], [15.5, 'promptEnd', 'own'], [16, 'send', 'own'], [18, 'toolCall'], [24, 'result'], [30, 'answerEnd']],
  // [beat the camera arrives, region of the take, fill (wide, reel), beats the move takes]
  cam: [[0, 'frame'], [9.6, 'composer', [0.72, 1]], [18.4, 'tool', [0.8, 1]], [24, 'result', [0.84, 1]], [33.4, 'rows', [0.96, 1.08], 1.8]],
  marks: [[34.4, 'status', 41.6]],
  agents: [{ name: 'your assistant', path: BUBBLE }, { name: 'your agent', path: SPARK }],
  mark: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z',
  copy: {
    en: {
      hook: { wide: ['Ask your assistant', 'to plan your week.'], reel: ['Ask your', 'assistant to', 'plan your week.'] },
      captions: [
        [8.6, 'You ask in your own words'],
        [17, 'Your assistant calls the product'],
        [24.4, 'The open tasks, from your projects'],
        [32, 'A re-enacted session, example tasks'],
        [38, 'The model phrases it. The product knows.'],
      ],
      sped: 'Sped up',
      end: {
        head: { wide: [['Ask', '{agent}.'], ['*The', '*product', '*knows.']], reel: [['Ask'], ['{agent}.'], ['*The', '*product'], ['*knows.']] },
        note: {
          wide: ['Connect your agent · on every plan', 'example.com/agents'],
          reel: ['Connect your agent', 'on every plan', 'example.com/agents'],
        },
      },
    },
  },
}
