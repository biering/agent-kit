import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../skills/carousel/scripts/crop.mjs'
import {
  FORMATS,
  extractCopy,
  findPlaceholders,
  inline,
  loadBrand,
  pdfDocument,
  renderDocument,
  unsetTokens,
  validateCarousel,
} from '../skills/carousel/scripts/render.mjs'

/**
 * The carousel renderer, minus the browser: validation, the placeholder gate, inline markup and the
 * HTML it hands to Playwright. The screenshots themselves are checked by eye (SKILL.md).
 */
const SKILL = fileURLToPath(new URL('../skills/carousel/', import.meta.url))
const EXAMPLE = path.join(SKILL, 'brands/example')
const load = (rel) => JSON.parse(readFileSync(path.join(SKILL, rel), 'utf8'))
const templates = readdirSync(path.join(EXAMPLE, 'templates'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => `brands/example/templates/${f}`)

/** A brand beside the carousel, with extra grounds, a closing slide and its own layout. */
function acme({ theme = readFileSync(path.join(EXAMPLE, 'theme.css'), 'utf8'), layout } = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'carousel-test-'))
  const dir = path.join(base, 'acme')
  mkdirSync(dir)
  writeFileSync(
    path.join(dir, 'brand.json'),
    JSON.stringify({ name: 'Acme', apps: ['apps/acme'], lang: 'en', themes: ['card', 'soft'], outro: { en: 'outro.en.html' } }),
  )
  writeFileSync(path.join(dir, 'theme.css'), theme)
  writeFileSync(path.join(dir, 'outro.en.html'), '<p class="outro-line">The end.</p><span class="counter">{{counter}}</span>')
  if (layout) writeFileSync(path.join(dir, 'slides.css'), layout)
  return { baseDir: base, brand: './acme' }
}

/** A finished carousel on the example brand: no placeholders, one of most slide types. */
const finished = () => ({
  brand: 'example',
  title: 'Feature launch',
  slides: [
    { type: 'cover', kicker: 'New', headline: 'Reports *now* export', subline: 'One click.' },
    { type: 'feature', title: 'Export', body: 'The **PDF** keeps every chart.', image: 'out/assets/export.png', fit: 'contain', theme: 'dark' },
    { type: 'steps', title: 'How', steps: [{ title: 'Open' }, { title: 'Export' }] },
    { type: 'chat', messages: [{ from: 'user', text: 'Export it' }, { from: 'agent', text: 'Done:\n**report.pdf**' }] },
    { type: 'cta', headline: 'Try it', button: 'Start free', url: 'example.com' },
  ],
})

describe('carousel', () => {
  for (const file of templates) {
    it(`${file} is a valid carousel, and all placeholders`, () => {
      assert.deepEqual(validateCarousel(load(file)), [])
      assert.ok(findPlaceholders(load(file)).length > 0)
    })
  }

  it('validates chat messages', () => {
    const chat = (messages) => validateCarousel({ brand: 'example', slides: [{ type: 'chat', messages }] })
    assert.deepEqual(chat([{ from: 'user', text: 'a' }, { from: 'agent', text: 'b' }]), [])
    assert.match(chat([{ from: 'user', text: 'a' }])[0], /2 to 5 messages/)
    assert.match(chat([{ from: 'bot', text: 'a' }, { from: 'agent', text: 'b' }])[0], /"from" must be one of/)
    assert.match(chat([{ from: 'user' }, { from: 'agent', text: 'b' }])[0], /no text/)
  })

  it('--copy gives one paragraph per slide, without markup or layout fields', () => {
    const doc = finished()
    const copy = extractCopy(doc)
    assert.equal(copy.split('\n\n').length, doc.slides.length)
    assert.doesNotMatch(copy, /\*|assets\/|contain|\bdark\b|\bcover\b/)
    assert.match(copy, /Reports now export/)
    const chat = extractCopy({ slides: [{ type: 'chat', messages: [{ from: 'user', text: 'Find **3** deals' }, { from: 'agent', text: 'Berlin:\n58 m²' }] }] })
    assert.equal(chat, 'Find 3 deals Berlin: 58 m²')
  })

  it('builds the PDF from the PNGs, one page each, so print cannot restyle a slide', () => {
    const html = pdfDocument(['/out/01.png', '/out/02.png'], { width: 1080, height: 1350 })
    assert.equal(html.match(/<img /g).length, 2)
    assert.match(html, /@page\{size:1080px 1350px;margin:0\}/)
    assert.match(html, /src="file:\/\/\/out\/02\.png"/)
    // Printed shadows are what drew a coloured block over the text in PDF viewers.
    assert.doesNotMatch(html, /shadow|slides\.css/)
  })

  it('crop: requires a cut, samples the canvas colour unless told otherwise', () => {
    const cut = ['in.png', 'out.png', '--x=10', '--y=20', '--w=300', '--h=100']
    assert.deepEqual(parseArgs(cut).errors, [])
    assert.equal(parseArgs(cut).box.bg, '#f4f4f5')
    assert.equal(parseArgs([...cut, '--canvas=900x600']).box.bg, 'auto')
    assert.equal(parseArgs([...cut, '--canvas=900x600', '--bg=#fff']).box.bg, '#fff')
    assert.match(parseArgs(['in.png', 'out.png', '--w=300']).errors.join(), /--h/)
    assert.match(parseArgs([...cut, '--canvas=200x50']).errors.join(), /at least the cut/)
    assert.match(parseArgs([...cut, '--canvas=big']).errors.join(), /900x620/)
    assert.match(parseArgs([...cut, '--align=top']).errors.join(), /--align/)
  })

  it('rejects unknown types, missing fields and too many slides', () => {
    const v = (doc) => validateCarousel({ brand: 'example', ...doc })
    assert.match(v({ slides: [{ type: 'hero' }] })[0], /type "hero"/)
    assert.match(v({ slides: [{ type: 'stat', value: '12' }] })[0], /missing "label"/)
    assert.match(v({ slides: [{ type: 'steps', title: 'x', steps: [{}] }] })[0], /2 to 4 steps/)
    const cta = { type: 'cta', headline: 'x' }
    assert.deepEqual(v({ slides: Array(10).fill(cta) }), [])
    assert.match(v({ slides: Array(11).fill(cta) })[0], /Instagram stops at 10/)
    // A brand with a closing slide appends it, so 9 of your own is the most Instagram takes.
    const { baseDir, brand } = acme()
    assert.deepEqual(validateCarousel({ brand, slides: Array(9).fill(cta) }, { baseDir }), [])
    assert.match(validateCarousel({ brand, slides: Array(10).fill(cta) }, { baseDir })[0], /plus the closing slide/)
    assert.match(v({ format: 'portrait', slides: [cta] })[0], /"format" is gone/)
    assert.match(v({ formats: ['1080x1921'], slides: [cta] })[0], /formats must be/)
    assert.deepEqual(v({ formats: ['1080x1080'], slides: [cta] }), [])
  })

  it("validates crop recipes with the crop tool's own rules", () => {
    const v = (crops) => validateCarousel({ brand: 'example', crops, slides: [{ type: 'cta', headline: 'x' }] })
    const ok = { from: 'docs/img/x.png', to: 'x-cut.png', x: 0, y: 0, w: 10, h: 10 }
    assert.deepEqual(v([ok]), [])
    assert.deepEqual(v([{ ...ok, canvas: '900x800', align: 'right' }]), [])
    assert.match(v([{ ...ok, to: 'assets/X.png' }]).join(), /"to" must be a file name/)
    assert.match(v([{ ...ok, from: undefined }]).join(), /"from"/)
    assert.match(v([{ ...ok, h: undefined }]).join(), /w and h are required/)
    assert.match(v([{ ...ok, canvas: '5x5' }]).join(), /at least the cut/)
  })

  it('needs a brand that exists', () => {
    const slides = [{ type: 'cta', headline: 'x' }]
    assert.match(validateCarousel({ slides })[0], /brand is missing/)
    assert.match(validateCarousel({ brand: 'nope', slides })[0], /brand "nope" has no brand.json/)
  })

  it("a ground is the brand's to offer: card and soft exist only where the brand lists them", () => {
    const { baseDir, brand } = acme()
    const slides = [{ type: 'cta', headline: 'x', theme: 'soft' }]
    assert.deepEqual(validateCarousel({ brand, slides }, { baseDir }), [])
    assert.match(validateCarousel({ brand: 'example', slides })[0], /theme must be light or dark/)
  })

  it('appends the closing slide, counted in the pager, after its own layout', () => {
    const { baseDir, brand } = acme({ layout: '.brand-acme .slide { padding: 0; }' })
    const doc = { brand, slides: [{ type: 'cover', headline: 'x' }, { type: 'cta', headline: 'y' }] }
    const html = renderDocument(doc, { baseDir })
    const sections = html.split('<section class="slide ').slice(1)
    assert.equal(sections.length, 3)
    assert.match(sections.at(-1), /^outro">.*The end\..*03 \/ 03/s)
    assert.match(sections.at(-2), /class="swipe"/, 'the last content slide swipes on to the closing slide')
    assert.match(html, /<body class="brand-acme ratio-4x5">/)
    // The brand's slides.css has to come last: it only wins over the shared rules from there.
    assert.ok(html.indexOf('.brand-acme .slide {') > html.indexOf('.lead { display: contents; }'))
    assert.doesNotMatch(html, /\{\{(repoRoot|brandDir|counter)\}\}/)
  })

  it('draws the product instead of screenshotting it: source, finding, status, report, gaps', () => {
    const v = (slide) => validateCarousel({ brand: 'example', slides: [slide] })
    assert.match(v({ type: 'source', title: 'x', doc: { name: 'Lease' } })[0], /doc needs a name and a quote/)
    assert.match(v({ type: 'finding', title: 'x', severity: 'urgent' })[0], /severity must be one of critical, high, medium, low/)
    assert.match(
      v({ type: 'status', title: 'x', percent: 120, steps: [{ state: 'done', title: 'a' }, { state: 'busy', title: 'b' }] }).join(),
      /"state" must be one of.*percent is a number from 0 to 100/s,
    )
    assert.match(v({ type: 'report', title: 'x', pages: ['Cover'] })[0], /2 to 8 pages/)
    assert.match(v({ type: 'gaps', title: 'x', items: [{ name: 'a' }, {}] })[0], /every item needs a name/)
    assert.match(v({ type: 'cover', headline: 'x', pages: ['done', 'lost'] })[0], /pages must be a list of done, active, open/)

    const html = renderDocument(
      {
        brand: 'example',
        slides: [
          { type: 'cover', headline: 'x', pages: ['done', 'active', 'open'], excerpt: { name: 'Lease', page: 'p. 3', quote: 'Ground lease' } },
          { type: 'finding', title: 'x', severity: 'high', cost: { value: '$6,840', unit: 'a year' } },
          { type: 'gaps', title: 'x', found: 20, total: 24, items: [{ name: 'Lease', note: '3 p.' }, { name: 'Energy certificate', missing: true }] },
        ],
      },
      { baseDir: '/x' },
    )
    assert.equal(html.match(/<span class="page (done|active|open)">/g).length, 3)
    // Severity reads without colour: three of four dots filled, and the word.
    assert.match(html, /<span class="gauge sev-high">(<i class="on"><\/i>){3}<i><\/i><\/span><span class="chip sev-high">HIGH<\/span>/)
    assert.match(html, /<div class="bar thin"><i style="width:83%">/)
    assert.match(html, /<li class="gap">.*Energy certificate.*missing/)
    // `missing` is the image placeholder's class; a gap in the list must not pick up its stripes.
    assert.doesNotMatch(html, /<li class="missing">/)
    // States and counts are layout, not copy: the slop scan reads words only.
    assert.equal(
      extractCopy({ slides: [{ type: 'cover', headline: 'Hello', pages: ['done', 'open'] }, { type: 'finding', title: 'Finding', severity: 'high' }] }),
      'Hello\n\nFinding',
    )
  })

  it('checks what the drawn slides are given before it maps over it, and escapes it', () => {
    const v = (slide) => validateCarousel({ brand: 'example', slides: [slide] }).join()
    assert.match(v({ type: 'report', title: 'x', pages: 'Cover' }), /"pages" must be a list/)
    assert.match(v({ type: 'gaps', title: 'x', items: {} }), /"items" must be a list/)
    assert.match(v({ type: 'report', title: 'x', pages: ['a', 'b'], active: 3 }), /active is the number of a page, 1 to 2/)
    assert.match(v({ type: 'report', title: 'x', pages: ['a', 'b'], active: '2' }), /active is the number of a page/)
    assert.match(v({ type: 'gaps', title: 'x', total: 0, items: [{ name: 'a' }, { name: 'b' }] }), /total above 0/)
    assert.match(v({ type: 'cover', headline: 'x', excerpt: 'text' }), /excerpt needs a name and a quote/)
    assert.match(v({ type: 'finding', title: 'x', severity: 'high', cost: { unit: 'a year' } }), /cost needs a value/)
    assert.match(v({ type: 'finding', title: 'x', severity: 'constructor' }), /severity must be one of/)

    const html = renderDocument(
      {
        brand: 'example',
        slides: [
          { type: 'source', title: 'x', doc: { name: 'Lease', quote: '<script>"a"</script>' } },
          { type: 'status', title: 'x', percent: 79, steps: [{ state: 'done', title: 'Read', time: '<b>' }, { state: 'waiting', title: 'Question' }, { state: 'running', title: 'Report' }] },
          { type: 'report', title: 'x', pages: ['Cover', 'Findings I'], active: 2 },
          { type: 'gaps', title: 'x', items: [{ name: 'Lease', note: '<i>' }, { name: 'Energy certificate', missing: true }, { name: 'Easement', missing: true }] },
        ],
      },
      { baseDir: '/x' },
    )
    assert.doesNotMatch(html, /<script>"a"|<span class="time"><b>|<span class="time"><i>/)
    assert.match(html, /&lt;script&gt;&quot;a&quot;/)
    assert.match(html, /<div class="bar"><i style="width:79%">/)
    assert.match(html, /<li class="done"><span class="dot">✓<\/span>.*<li class="waiting"><span class="dot">!<\/span>.*<li class="running"><span class="dot"><\/span>/s)
    assert.match(html, /<li class="active"><span>02<\/span><strong>Findings I<\/strong>/)
    assert.match(html, /<p class="sheet-head">02 · Findings I<\/p>/)
    // No counts given: what is there is counted from the list.
    assert.match(html, /<p class="gaps-count">1 of 3 /)
  })

  it('keeps the words of a cover and the actions of a CTA where the shared layout expects them', () => {
    const html = renderDocument(
      { brand: 'example', slides: [{ type: 'cover', headline: 'x' }, { type: 'cta', headline: 'y', button: 'Start free', url: 'example.com' }] },
      { baseDir: '/x' },
    )
    assert.match(html, /<div class="actions"><p class="button">Start free<\/p><p class="url">example\.com<\/p><\/div>/)
    // Both wrappers are transparent to the shared column (display: contents); a brand may lay them out.
    const layout = readFileSync(path.join(SKILL, 'scripts/slides.css'), 'utf8')
    assert.match(layout, /\.lead \{ display: contents; \}/)
    assert.match(layout, /\.actions \{ display: contents; \}/)
  })

  it('renders every format with its own ratio class', () => {
    for (const [name, { ratio, height }] of Object.entries(FORMATS)) {
      const html = renderDocument(finished(), { baseDir: '/x', format: name })
      assert.match(html, new RegExp(`ratio-${ratio.replace(':', 'x')}`))
      assert.match(html, new RegExp(`--w:1080px;--h:${height}px`))
    }
  })

  it('does not count an image path as a placeholder', () => {
    const doc = { slides: [{ type: 'feature', title: 'Done', image: 'assets/[draft].png' }] }
    assert.deepEqual(findPlaceholders(doc), [])
  })

  it('escapes HTML before applying accent and bold markup', () => {
    assert.equal(inline('<b>*Accent.*'), '&lt;b&gt;<em class="accent">Accent.</em>')
    assert.equal(inline('**bold** and\nnew'), '<strong>bold</strong> and<br>new')
  })

  it('renders a missing image as a named placeholder and keeps type classes apart from inner blocks', () => {
    const doc = finished()
    const html = renderDocument(doc, { baseDir: '/nonexistent' })
    assert.equal(html.match(/<section class="slide type-/g).length, doc.slides.length)
    assert.match(html, /class="shot missing"><span>Missing image<br>out\/assets\/export\.png/)
    // A slide classed plain `steps` or `quote` picks up the list/blockquote rules and shifts.
    assert.match(html, /class="slide type-steps light"/)
    assert.doesNotMatch(html, /class="slide (steps|quote) /)
    const sections = html.split('<section class="slide ').slice(1)
    assert.doesNotMatch(sections.at(-1), /class="swipe"/, 'the last slide has nothing to swipe to')
  })

  it("names every tint token a brand leaves to the layout's grey fallback", () => {
    assert.deepEqual(unsetTokens(loadBrand('example')), [])
    const theme = readFileSync(path.join(EXAMPLE, 'theme.css'), 'utf8').replace(/^\s*--(tint|tint-light|shadow-tint):.*\n/gm, '')
    const bare = acme({ theme })
    assert.deepEqual(unsetTokens(loadBrand(bare.brand, bare.baseDir)).sort(), ['--shadow-tint', '--tint', '--tint-light'])
    // The brand's own slides.css may set one instead, and `--shadow-tint:` is not `--tint:`.

    const layout = acme({ theme: theme + ':root { --shadow-tint: 1 2 3; }', layout: '.brand-acme { --tint-light: 4 5 6; }' })
    assert.deepEqual(unsetTokens(loadBrand(layout.brand, layout.baseDir)), ['--tint'])
  })
})
