// The story starter: a 40 beat film at 100 BPM, 24 s. Someone is up at night, the screen is the only
// light, the turn floods it with morning, then the product. Replace the plates, the lines, the palette
// and the name; keep the shape until it renders and passes `qa.mjs --style story`, then change scenes.
// Every time is a beat. The music's drop is at beat 24 (music.start from beats.py --drop-beat 24).
// A number on screen needs an entry in `sources`; there is none here.

// CSS plates: the real film uses pictures (`src`, generated or supplied, checked at 100%), these
// stand in so the starter renders with nothing to download. Layers run back to front; depth 0 is far, 1 near.
const FAR = 'polygon(0 100%,0 68%,4% 68%,4% 60%,9% 60%,9% 66%,15% 66%,15% 52%,21% 52%,21% 62%,27% 62%,27% 57%,33% 57%,33% 67%,40% 67%,40% 49%,46% 49%,46% 60%,53% 60%,53% 54%,59% 54%,59% 65%,66% 65%,66% 51%,72% 51%,72% 58%,79% 58%,79% 47%,85% 47%,85% 61%,92% 61%,92% 55%,100% 55%,100% 100%)'
const NEAR = 'polygon(0 100%,0 80%,6% 80%,6% 70%,14% 70%,14% 76%,22% 76%,22% 64%,30% 64%,30% 74%,38% 74%,38% 69%,47% 69%,47% 78%,56% 78%,56% 62%,64% 62%,64% 72%,72% 72%,72% 58%,81% 58%,81% 70%,90% 70%,90% 75%,100% 75%,100% 100%)'
const WINDOWS = (c, a, w, gap, h, hgap) => `background:repeating-linear-gradient(90deg,${c} 0 ${w}px,transparent ${w}px ${w + gap}px);-webkit-mask-image:repeating-linear-gradient(0deg,#000 0 ${h}px,transparent ${h}px ${h + hgap}px);opacity:${a}`

const night = [
  { depth: 0, css: 'background:radial-gradient(62% 58% at 74% 26%,#9bb0f2 0%,rgba(155,176,242,.55) 38%,rgba(128,149,230,0) 76%),linear-gradient(180deg,#0e1633 0%,#1b2853 52%,#2c376d 100%)' },
  { depth: 0.04, css: 'background:radial-gradient(circle at 12% 18%,#fff 0 1.2px,transparent 2.4px),radial-gradient(circle at 31% 9%,#dfe7ff 0 1px,transparent 2px),radial-gradient(circle at 47% 24%,#fff 0 1.4px,transparent 2.6px),radial-gradient(circle at 58% 12%,#cfdbff 0 1px,transparent 2px),radial-gradient(circle at 90% 15%,#fff 0 1.2px,transparent 2.4px),radial-gradient(circle at 66% 33%,#dfe7ff 0 1px,transparent 2px),radial-gradient(circle at 22% 37%,#fff 0 1px,transparent 2px)' },
  { depth: 0.08, css: 'background:radial-gradient(circle at 74% 24%,#f4f7ff 0 2.6%,rgba(233,239,255,.55) 4.5%,transparent 13%)' },
  { depth: 0.15, css: `background:#101a3d;clip-path:${FAR}` },
  { depth: 0.17, css: `${WINDOWS('rgba(247,213,138,.8)', 0.55, 4, 17, 6, 21)};clip-path:${FAR}` },
  { depth: 0.3, css: `background:#0a1130;clip-path:${NEAR}` },
  { depth: 0.32, css: `${WINDOWS('rgba(242,166,90,.9)', 0.4, 5, 29, 7, 33)};clip-path:${NEAR}` },
  { depth: 0.34, css: 'inset:63% 24.6% auto auto;width:2.7%;height:4.7%;background:#F2A65A;box-shadow:0 0 36px 10px rgba(242,166,90,.6)' },
  { depth: 0.62, css: 'inset:8% 9% 17% 9%;box-shadow:0 0 0 3000px #06080f;border:2px solid rgba(150,175,240,.32)' },
  { depth: 0.62, css: 'inset:8% 49% 17% 49%;background:#06080f' },
  { depth: 0.62, css: 'inset:44% 9% 54% 9%;background:#06080f' },
  { depth: 0.66, css: 'inset:8% 9% 17% 9%;background:linear-gradient(112deg,transparent 30%,rgba(190,210,255,.10) 42%,transparent 54%)' },
  { depth: 0.8, css: 'background:radial-gradient(52% 26% at 64% 100%,rgba(242,166,90,.5),transparent 72%)' },
  { depth: 1, css: 'inset:0 auto 0 0;width:15%;background:linear-gradient(90deg,#020309 0%,#080c19 72%,rgba(8,12,25,0) 100%)' },
  { depth: 1, css: 'inset:0 0 0 auto;width:11%;background:linear-gradient(270deg,#020309 0%,#080c19 62%,rgba(8,12,25,0) 100%)' },
]

const desk = [
  { depth: 0, css: 'background:linear-gradient(180deg,#0b0f22 0%,#141a38 58%,#0a0d1f 100%)' },
  { depth: 0.05, css: 'background:radial-gradient(34% 50% at 76% 28%,rgba(242,166,90,.2),rgba(242,166,90,.04) 55%,transparent 78%)' },
  { depth: 0.2, css: 'inset:12% auto auto 8%;width:13%;height:20%;background:#0d1226;border:3px solid #3a4676;box-shadow:inset 0 0 0 10px #1b2244' },
  { depth: 0.2, css: 'inset:40% 0 auto 0;height:1.2%;background:#0b0f20' },
  { depth: 0.45, css: 'inset:63% 0 0 0;background:linear-gradient(180deg,#3d291f 0%,#1f1511 40%,#140e0b 100%);border-top:3px solid rgba(255,206,150,.5)' },
  { depth: 0.5, css: 'inset:63% 0 0 42%;background:radial-gradient(62% 95% at 78% 0%,rgba(255,196,120,.42),transparent 72%)' },
  { depth: 0.58, css: 'inset:61.5% 47% 35.5% 11%;background:linear-gradient(180deg,#313750,#12152a);clip-path:polygon(5% 0,95% 0,100% 100%,0 100%)' },
  { depth: 0.6, css: 'inset:30% 52% 38.5% 14%;background:linear-gradient(165deg,#e8efff 0%,#b2c6f6 100%);border:12px solid #090c17;border-radius:10px;box-shadow:0 0 150px 34px rgba(150,185,255,.45)' },
  { depth: 0.6, css: 'inset:35% 56% 42% 17%;background:repeating-linear-gradient(180deg,rgba(24,38,90,.6) 0 9px,transparent 9px 28px)' },
  { depth: 0.6, css: 'inset:35% 74% 42% 15.4%;background:repeating-linear-gradient(180deg,#F2A65A 0 9px,transparent 9px 28px);width:1.1%' },
  { depth: 0.72, css: 'inset:51% 30.5% 27.5% 62%;background:linear-gradient(90deg,#c9bfae,#f6eee0 42%,#a99d89);border-radius:5% 5% 24% 24%;box-shadow:0 0 50px 8px rgba(255,196,120,.3)' },
  { depth: 0.72, css: 'inset:54.5% 27% 32.5% 68.6%;border:10px solid #d3c8b6;border-left:0;border-radius:0 50% 50% 0' },
  { depth: 0.8, css: 'background:radial-gradient(24% 42% at 76.9% 31.5%,rgba(255,230,180,1),rgba(255,200,130,.8) 42%,rgba(255,180,100,0) 82%)' },
  { depth: 0.82, css: 'inset:0 20% auto auto;width:2.6%;height:31%;background:#080b17;transform:skewX(-13deg);transform-origin:50% 100%' },
  { depth: 0.82, css: 'inset:24% 18% auto auto;width:11%;height:7.5%;background:#080b17;clip-path:polygon(0 100%,26% 0,100% 0,100% 55%)' },
  { depth: 0.84, css: 'inset:29.5% 20.6% auto auto;width:5%;height:4%;background:#fff3d6;border-radius:50%;box-shadow:0 0 90px 40px rgba(255,200,120,.7)' },
  { depth: 1, css: 'inset:80% auto 0 0;width:34%;background:linear-gradient(180deg,#0c0b12,#050407);clip-path:polygon(0 14%,100% 0,100% 100%,0 100%)' },
]

const morning = [
  { depth: 0, css: 'background:linear-gradient(180deg,#ffe9c4 0%,#ffd5a1 48%,#f7bb86 100%)' },
  { depth: 0.05, css: 'background:radial-gradient(40% 54% at 24% 26%,#fffbe8 0%,rgba(255,240,200,.78) 30%,rgba(255,220,160,0) 74%)' },
  { depth: 0.1, css: 'inset:15% auto auto 20.5%;width:7%;aspect-ratio:1;border-radius:50%;background:#fffef5;box-shadow:0 0 130px 55px rgba(255,244,205,.9)' },
  { depth: 0.3, css: 'inset:9% 40% 31% 7%;border:11px solid #c68b59;box-shadow:inset 0 0 0 4px rgba(255,255,255,.4),0 0 0 3000px rgba(246,199,148,.0)' },
  { depth: 0.3, css: 'inset:9% auto 31% 32%;width:3%;background:#c68b59' },
  { depth: 0.36, css: 'background:repeating-linear-gradient(104deg,transparent 0 7%,rgba(255,250,225,.36) 7% 12.5%);-webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 80%)' },
  { depth: 0.5, css: 'inset:66% 0 0 0;background:linear-gradient(180deg,#f2d5b0 0%,#dcb07e 100%);border-top:3px solid rgba(255,255,255,.6)' },
  { depth: 0.6, css: 'inset:62.5% 52% 29% 11%;background:linear-gradient(180deg,#d4d9e4,#a6adbb);border-radius:5px 5px 2px 2px;box-shadow:0 14px 28px rgba(120,70,30,.28)' },
  { depth: 0.72, css: 'inset:51% 30.5% 27.5% 62%;background:linear-gradient(90deg,#e6dccb,#fffaf0 42%,#cfc2ad);border-radius:5% 5% 24% 24%;box-shadow:0 18px 30px rgba(120,70,30,.3)' },
  { depth: 0.72, css: 'inset:54.5% 27% 32.5% 68.6%;border:10px solid #ebe0cf;border-left:0;border-radius:0 50% 50% 0' },
  { depth: 0.74, css: 'inset:30% 31.5% 49% 63.5%;background:radial-gradient(45% 50% at 50% 100%,rgba(255,255,255,.85),transparent);filter:blur(12px)' },
  { depth: 0.86, css: 'inset:44% 6% 22% auto;width:8%;background:#7f9a62;border-radius:0 100% 0 100%;transform:rotate(-12deg)' },
  { depth: 0.86, css: 'inset:36% 9% 30% auto;width:6%;background:#6a8a55;border-radius:0 100% 0 100%;transform:rotate(18deg)' },
  { depth: 1, css: 'inset:0 auto 0 0;width:17%;background:linear-gradient(90deg,rgba(255,255,255,.78),rgba(255,255,255,0))' },
]

export default {
  title: 'PRODUCT',
  bpm: 100,
  beats: 40,
  fps: 30,
  palette: { bg: '#0D1822', paper: '#F4EEE2', accent: '#F2A65A', ink: '#16130F' },
  music: { file: 'music/606.mp3', source: 'https://assets.mixkit.co/music/606/606.mp3', start: 0.422, gain_db: -6, fade_out: 0.5 },
  sources: {},
  plates: [
    { id: 'window-night', css: night },
    { id: 'desk', css: desk },
    { id: 'morning', css: morning },
  ],
  scenes: [
    // the hook: the situation, and the line lands 0.3 s in; the cut-in is the moon
    { block: 'Plate', at: [0, 8], plate: 'window-night', push: [1.05, 1.22], pan: [[0.42, 0.5], [0.6, 0.46]], cutIns: [[5, 2.2, [0.745, 0.27], [0.72, 0.27]]] },
    // the setup: the desk, then the screen that lights it
    { block: 'Plate', at: [8, 16], plate: 'desk', shade: 0.75, push: [1.08, 1.22], pan: [[0.6, 0.45], [0.45, 0.5]], cutIns: [[12, 2.4, [0.32, 0.52], [0.29, 0.52]]] },
    // the cup gone cold, then the lamp that has been on all night
    { block: 'Plate', at: [16, 24], plate: 'desk', shade: 0.75, push: [2, 2.2], pan: [[0.6, 0.66], [0.7, 0.66]], cutIns: [[20, 2.4, [0.68, 0.34], [0.769, 0.325]]] },
    // the turn, on the bar line and the music's drop: the lamp's light grows into morning
    { block: 'Turn', at: [24, 26], kind: 'flood', dur: 1.5, origin: [0.5, 0.5] },
    // the payoff
    { block: 'Plate', at: [26, 34], plate: 'morning', tone: 'light', push: [1.06, 1.2], pan: [[0.3, 0.45], [0.55, 0.5]], cutIns: [[30, 2.2, [0.62, 0.68], [0.69, 0.68]]] },
    // the product: mark, one line, one call to action
    { block: 'Card', at: [34, 40], wordmark: 'PRODUCT', line: 'Gets to it first.', cta: 'Get it today' },
  ],
  // lines are in the product's voice, five words at most, each word on a beat
  lines: [
    { at: [0, 4], words: [['Still', 0.5], ['at', 1], ['it.', 1.5]] },
    { at: [4.5, 8], words: [['Three', 5], ['nights.', 5.5]] },
    { at: [8.5, 13], words: [['Every', 9], ['reply', 9.5], ['by', 10], ['hand.', 10.5]] },
    { at: [17, 22], words: [['You', 17.5], ['could', 18], ['stop.', 19, 'accent']] },
    { at: [26.5, 30.5], words: [['Morning.', 27]] },
    { at: [31, 34], words: [['Already', 31.5], ['done.', 32]] },
  ],
}
