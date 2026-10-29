#!/usr/bin/env node
/**
 * Render a carousel (`carousel` skill) from a carousel.json.
 *
 *   node .agents/skills/carousel/scripts/render.mjs <carousel.json> <out-dir> [--strict]
 *   node .agents/skills/carousel/scripts/render.mjs <carousel.json> --copy | python3 .agents/skills/unslop/scripts/slop_scan.py -
 *
 * Writes into <out-dir>/<WxH>/, one folder per format:
 *   slides.html      every slide on one page (open it to debug a layout)
 *   01.png … NN.png  one image per slide, 1080 px wide (Instagram, TikTok, LinkedIn image post)
 *   carousel.pdf     the PNGs, one per page (LinkedIn document carousel). Built from the PNGs,
 *                    not by printing the HTML: print rasterizes blurred shadows into flat
 *                    blocks that PDF viewers draw over the text.
 *   preview.png      all slides side by side, for a one-glance review
 * and <out-dir>/alt.md, each slide's alt text, when the slides carry one.
 *
 * Image paths in the JSON resolve relative to the carousel.json. A missing image renders as a
 * striped placeholder that names the file, so a draft previews before the screenshots exist.
 * Template text in [square brackets] is a placeholder too. Both are warnings by default and
 * errors under --strict, which is the gate before anything is posted.
 *
 * --copy prints the words only, one paragraph per slide, for the unslop scanner: fed field by
 * field, every short slide line reads as a staccato paragraph and the scan flags that instead of
 * real slop.
 *
 * Exit 0 = rendered, 1 = rendered with placeholders or overflow under --strict, 2 = invalid input.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { cropImage, launchCropBrowser, parseArgs as parseCropArgs } from './crop.mjs'
import { REPO_BRANDS_DIR, REPO_ROOT, launchChromium } from './repo.mjs'

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every carousel renders in the three feed formats, each into its own out/<name>/ folder.
 * Instagram crops the feed preview to the first slide's ratio, so a campaign picks one format per
 * post; which one is a posting decision, not a rendering one. 1080x1920 (TikTok photo mode,
 * Stories) renders when `formats` names it, and keeps everything in the central 4:5 band, clear
 * of the app's caption and buttons.
 */
export const FORMATS = {
  '1080x1080': { width: 1080, height: 1080, ratio: '1:1' },
  '1080x1350': { width: 1080, height: 1350, ratio: '4:5' },
  '1080x1440': { width: 1080, height: 1440, ratio: '3:4' },
  '1080x1920': { width: 1080, height: 1920, ratio: '9:16' },
}

export const DEFAULT_FORMATS = ['1080x1080', '1080x1350', '1080x1440']

/** Slide type → the fields it needs. Everything else on a slide is optional. */
export const SLIDE_TYPES = {
  cover: ['headline'],
  feature: ['title'],
  steps: ['title', 'steps'],
  stat: ['value', 'label'],
  quote: ['quote', 'author'],
  cta: ['headline'],
  chat: ['messages'],
  source: ['title', 'doc'],
  finding: ['title', 'severity'],
  status: ['title', 'percent', 'steps'],
  report: ['title', 'pages'],
  gaps: ['title', 'items'],
  lettered: ['lines'],
}

/** A finding's severity: how many of the four gauge dots are filled. The word is per language. */
export const SEVERITIES = { critical: 4, high: 3, medium: 2, low: 1 }

/** Fields that hold a list: checked before the renderer maps over them. */
const LIST_FIELDS = { steps: ['steps'], status: ['steps'], report: ['pages'], gaps: ['items'], chat: ['messages'], lettered: ['lines'] }

/** A step on a `status` slide, and a page in a `pages` strip. */
const STEP_STATES = ['done', 'running', 'waiting', 'open']
const PAGE_STATES = ['done', 'active', 'open']

const CHAT_ROLES = ['user', 'agent', 'tool']

const LABELS = {
  de: { swipe: 'Wischen', missing: 'Bild fehlt', gap: 'fehlt', of: 'von', agent: 'Dein Agent', severity: { critical: 'KRITISCH', high: 'HOCH', medium: 'MITTEL', low: 'NIEDRIG' } },
  en: { swipe: 'Swipe', missing: 'Missing image', gap: 'missing', of: 'of', agent: 'Your agent', severity: { critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW' } },
}

const PLACEHOLDER = /\[[^\]\n]{2,}\]/g

/** The kit's own brands (a neutral `example`); the repo's brands folder is searched first. */
export const KIT_BRANDS_DIR = path.join(SKILL_DIR, 'brands')

const brandRoots = () => [REPO_BRANDS_DIR, KIT_BRANDS_DIR].filter((d) => d && existsSync(d))
const isRemote = (src) => /^https?:\/\//.test(src)

/** Every brand id with a brand.json: one per product that posts in its own look. */
export function listBrands() {
  const ids = new Set()
  for (const root of brandRoots())
    for (const d of readdirSync(root, { withFileTypes: true }))
      if (d.isDirectory() && existsSync(path.join(root, d.name, 'brand.json'))) ids.add(d.name)
  return [...ids]
}

/**
 * Where a brand lives. An id resolves in the repo's brands folder (agent-kit.config.json →
 * carousel.brands), then in the kit's; a path (`./brand`, `../brands/acme`) resolves from baseDir.
 */
export function brandDir(ref, baseDir = process.cwd()) {
  if (!ref || typeof ref !== 'string') return null
  if (ref.startsWith('.') || ref.includes('/')) {
    const dir = path.resolve(baseDir, ref)
    return existsSync(path.join(dir, 'brand.json')) ? dir : null
  }
  for (const root of brandRoots()) if (existsSync(path.join(root, ref, 'brand.json'))) return path.join(root, ref)
  return null
}

/**
 * A brand's config, theme and closing slide. A font or image `src` is relative to the brand
 * folder, `repo:<path>` for a file the repo already has (an app's @fontsource package), or an
 * https URL the browser loads.
 */
export function loadBrand(ref, baseDir) {
  const dir = brandDir(ref, baseDir)
  if (!dir) throw new Error(`brand "${ref}" has no brand.json`)
  const id = path.basename(dir)
  const config = JSON.parse(readFileSync(path.join(dir, 'brand.json'), 'utf8'))
  const resolve = (src) => (src.startsWith('repo:') ? path.join(REPO_ROOT, src.slice(5)) : path.join(dir, src))
  const url = (src) => (isRemote(src) ? src : pathToFileURL(resolve(src)).href)
  const fonts = (config.fonts ?? []).map((f) => (isRemote(f.src) ? { ...f, url: f.src } : { ...f, file: resolve(f.src) }))
  return {
    id,
    dir,
    config,
    fonts,
    theme: readFileSync(path.join(dir, 'theme.css'), 'utf8'),
    logo: config.logo ? url(config.logo) : null,
    /** A drawn wordmark per ground (`light`, `dark`) replaces the icon and the typed name. */
    wordmark: config.wordmark ? Object.fromEntries(Object.entries(config.wordmark).map(([k, src]) => [k, url(src)])) : null,
    /** The mascot's poses by name, for `lettered` slides. */
    poses: Object.fromEntries(Object.entries(config.mascot?.poses ?? {}).map(([k, src]) => [k, url(src)])),
    /** Grounds beyond light and dark that this brand's slides may sit on (`card`, `soft`). */
    themes: ['light', 'dark', ...(config.themes ?? [])],
    /** The brand's own layout, read after the shared slides.css: where its look departs from it. */
    layout: existsSync(path.join(dir, 'slides.css')) ? readFileSync(path.join(dir, 'slides.css'), 'utf8') : '',
    /** The fixed closing slide for this language, or null when the brand has none for it. */
    outro: (lang) => {
      const file = config.outro?.[lang]
      return file ? readFileSync(path.join(dir, file), 'utf8') : null
    },
  }
}

/** The carousel's language: its own, else the brand's, else English. */
export const langOf = (doc, brand) => doc.lang ?? brand?.config.lang ?? 'en'

/** A carousel's own poses (paths relative to it) win over the brand's. */
const posesOf = (doc, brand, baseDir) => ({
  ...(brand?.poses ?? {}),
  ...Object.fromEntries(Object.entries(doc.mascot?.poses ?? {}).map(([k, src]) => [k, isRemote(src) ? src : pathToFileURL(path.resolve(baseDir, src)).href])),
})

export function validateCarousel(doc, { baseDir = process.cwd() } = {}) {
  const errors = []
  if (!doc || typeof doc !== 'object') return ['carousel.json is not an object']
  const brands = listBrands()
  const dir = brandDir(doc.brand, baseDir)
  if (!doc.brand) errors.push(`brand is missing: one of ${brands.join(', ')} (the product the feature lives in)`)
  else if (!dir) errors.push(`brand "${doc.brand}" has no brand.json (available: ${brands.join(', ')}; a repo's brands folder is carousel.brands in agent-kit.config.json)`)
  if (doc.format !== undefined) errors.push('"format" is gone: every format renders; use "formats": [...] to render only some')
  if (doc.formats !== undefined && (!Array.isArray(doc.formats) || doc.formats.length === 0 || doc.formats.some((f) => !FORMATS[f])))
    errors.push(`formats must be a non-empty list of ${Object.keys(FORMATS).join(', ')}`)
  if (doc.crops !== undefined) errors.push(...validateCrops(doc.crops))
  if (!Array.isArray(doc.slides) || doc.slides.length === 0) return [...errors, 'slides must be a non-empty array']
  const brand = dir ? loadBrand(doc.brand, baseDir) : null
  const themes = brand?.themes ?? ['light', 'dark']
  if (doc.theme && !themes.includes(doc.theme)) errors.push(`theme must be one of ${themes.join(', ')}`)
  if (!LABELS[langOf(doc, brand)]) errors.push(`lang "${langOf(doc, brand)}" is not one of ${Object.keys(LABELS).join(', ')}`)
  const outro = brand?.outro(langOf(doc, brand)) ? 1 : 0
  if (doc.slides.length + outro > 10)
    errors.push(`${doc.slides.length} slides${outro ? ' plus the closing slide' : ''}: Instagram stops at 10, and so do we`)
  doc.slides.forEach((slide, i) => {
    const at = `slide ${i + 1}`
    const required = SLIDE_TYPES[slide?.type]
    if (!required) {
      errors.push(`${at}: type "${slide?.type}" is not one of ${Object.keys(SLIDE_TYPES).join(', ')}`)
      return
    }
    for (const field of required) if (slide[field] == null || slide[field] === '') errors.push(`${at} (${slide.type}): missing "${field}"`)
    if (slide.theme && !themes.includes(slide.theme)) errors.push(`${at}: theme must be ${themes.join(' or ')}`)
    if (slide.pages !== undefined && slide.type !== 'report' && (!Array.isArray(slide.pages) || slide.pages.some((p) => !PAGE_STATES.includes(p))))
      errors.push(`${at}: pages must be a list of ${PAGE_STATES.join(', ')}`)
    if (slide.type === 'source' && slide.doc && (!slide.doc.name || !slide.doc.quote)) errors.push(`${at} (source): doc needs a name and a quote`)
    for (const field of LIST_FIELDS[slide.type] ?? []) if (slide[field] != null && !Array.isArray(slide[field])) errors.push(`${at} (${slide.type}): "${field}" must be a list`)
    if (slide.excerpt !== undefined && (!slide.excerpt?.name || !slide.excerpt?.quote)) errors.push(`${at}: excerpt needs a name and a quote`)
    if (slide.type === 'finding' && slide.cost !== undefined && !slide.cost?.value) errors.push(`${at} (finding): cost needs a value`)
    if (slide.type === 'finding' && slide.severity && !Object.hasOwn(SEVERITIES, slide.severity)) errors.push(`${at} (finding): severity must be one of ${Object.keys(SEVERITIES).join(', ')}`)
    if (slide.type === 'status' && Array.isArray(slide.steps)) {
      if (slide.steps.length < 2 || slide.steps.length > 5) errors.push(`${at} (status): 2 to 5 steps fit on a slide, got ${slide.steps.length}`)
      slide.steps.forEach((step, j) => {
        if (!STEP_STATES.includes(step?.state)) errors.push(`${at} (status): step ${j + 1} "state" must be one of ${STEP_STATES.join(', ')}`)
        if (!step?.title) errors.push(`${at} (status): step ${j + 1} has no title`)
      })
    }
    if (slide.type === 'status' && slide.percent != null && !(Number(slide.percent) >= 0 && Number(slide.percent) <= 100)) errors.push(`${at} (status): percent is a number from 0 to 100`)
    if (slide.type === 'report' && Array.isArray(slide.pages)) {
      if (slide.pages.length < 2 || slide.pages.length > 8) errors.push(`${at} (report): 2 to 8 pages fit on a slide, got ${slide.pages.length}`)
      if (slide.active !== undefined && !(Number.isInteger(slide.active) && slide.active >= 1 && slide.active <= slide.pages.length))
        errors.push(`${at} (report): active is the number of a page, 1 to ${slide.pages.length}`)
    }
    if (slide.type === 'gaps' && [slide.found, slide.total].some((n) => n !== undefined && !(Number.isInteger(n) && n >= 0)) || (slide.type === 'gaps' && slide.total === 0))
      errors.push(`${at} (gaps): found and total are whole numbers, total above 0`)
    if (slide.type === 'gaps' && Array.isArray(slide.items)) {
      if (slide.items.length < 2 || slide.items.length > 6) errors.push(`${at} (gaps): 2 to 6 documents fit on a slide, got ${slide.items.length}`)
      if (slide.items.some((item) => !item?.name)) errors.push(`${at} (gaps): every item needs a name`)
    }
    if (slide.type === 'steps' && Array.isArray(slide.steps) && (slide.steps.length < 2 || slide.steps.length > 4))
      errors.push(`${at} (steps): 2 to 4 steps fit on a slide, got ${slide.steps.length}`)
    if (slide.type === 'lettered' && Array.isArray(slide.lines) && (slide.lines.length < 1 || slide.lines.length > 4 || slide.lines.some((l) => typeof l !== 'string')))
      errors.push(`${at} (lettered): 1 to 4 lines of text fit on a slide`)
    if (slide.type === 'quote' && slide.author && !slide.author.name) errors.push(`${at} (quote): author needs a name`)
    if (slide.type === 'chat' && Array.isArray(slide.messages)) {
      if (slide.messages.length < 2 || slide.messages.length > 5) errors.push(`${at} (chat): 2 to 5 messages fit on a slide, got ${slide.messages.length}`)
      slide.messages.forEach((m, j) => {
        if (!CHAT_ROLES.includes(m?.from)) errors.push(`${at} (chat): message ${j + 1} "from" must be one of ${CHAT_ROLES.join(', ')}`)
        if (!m?.text) errors.push(`${at} (chat): message ${j + 1} has no text`)
      })
    }
  })
  return errors
}

/**
 * `crops` turns a screenshot the repo already has into a slide image at render time, written to
 * out/assets/<to>. Generated files live only in out/; carousel.json keeps the recipe.
 */
export function validateCrops(crops) {
  if (!Array.isArray(crops)) return ['crops must be a list']
  return crops.flatMap((c, i) => {
    const at = `crop ${i + 1}`
    const errs = []
    if (!c?.from) errs.push(`${at}: "from" (a repo path to the source screenshot) is missing`)
    if (!/^[a-z0-9-]+\.png$/.test(c?.to ?? '')) errs.push(`${at}: "to" must be a file name like agent-button.png`)
    const { errors } = parseCropArgs(cropArgv(c ?? {}))
    return [...errs, ...errors.map((e) => `${at}: ${e.replace(/--/g, '')}`)]
  })
}

/** A crop entry as the crop tool's CLI arguments, so both share one parser. */
const cropArgv = (c) => [
  'in.png',
  'out.png',
  ...Object.entries(c).filter(([k]) => !['from', 'to'].includes(k)).map(([k, v]) => `--${k}=${v}`),
]

/** Run the carousel's crops into out/assets/. Returns warnings for sources that are missing. */
export async function runCrops(doc, outDir) {
  if (!doc.crops?.length) return []
  const dir = path.join(outDir, 'assets')
  mkdirSync(dir, { recursive: true })
  const browser = await launchCropBrowser()
  const warnings = []
  try {
    for (const c of doc.crops) {
      const input = path.join(REPO_ROOT, c.from)
      if (!existsSync(input)) {
        warnings.push(`crop ${c.to}: source ${c.from} not found`)
        continue
      }
      await cropImage(browser, { input, output: path.join(dir, c.to), box: parseCropArgs(cropArgv(c)).box })
    }
  } finally {
    await browser.close()
  }
  return warnings
}

/** Every [placeholder] left in the copy, with the slide it sits on. */
export function findPlaceholders(doc) {
  const found = []
  const walk = (value, where) => {
    if (typeof value === 'string') for (const m of value.match(PLACEHOLDER) ?? []) found.push(`${where}: ${m}`)
    else if (Array.isArray(value)) value.forEach((v) => walk(v, where))
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (k !== 'image') walk(v, where)
  }
  doc.slides.forEach((slide, i) => walk(slide, `slide ${i + 1}`))
  walk({ handle: doc.handle }, 'carousel')
  return found
}

const COPY_SKIP = new Set(['type', 'theme', 'image', 'fit', 'from', 'severity', 'state', 'missing', 'active', 'percent', 'found', 'total', 'pose', 'alt', 'url'])

/** The words on each slide as one paragraph, markup stripped: what a reader sees, in order. */
export function extractCopy(doc) {
  const texts = (value) =>
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(texts)
        : value && typeof value === 'object'
          ? Object.entries(value).flatMap(([k, v]) => (COPY_SKIP.has(k) || (k === 'pages' && value.type !== 'report') ? [] : texts(v)))
          : []
  return doc.slides
    .map((slide) => texts(slide).map((t) => t.replace(/\*+/g, '').replace(/\n/g, ' ').trim()).join(' '))
    .join('\n\n')
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Escape, then `*accent*` → serif accent, `**bold**` → strong, a newline → <br>. */
export function inline(text) {
  return escapeHtml(text ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="accent">$1</em>')
    .replace(/\n/g, '<br>')
}

/** An image slot: the file when it exists, otherwise a placeholder naming it. */
export function imageHtml(src, { baseDir, labels, fit = 'cover', className = 'shot' }) {
  if (!src) return ''
  const file = path.resolve(baseDir, src)
  if (existsSync(file))
    return `<div class="${className}"><img src="${pathToFileURL(file).href}" style="object-fit:${fit === 'contain' ? 'contain' : 'cover'}" alt=""></div>`
  return `<div class="${className} missing"><span>${escapeHtml(labels.missing)}<br>${escapeHtml(src)}</span></div>`
}

const kicker = (text) => (text ? `<p class="kicker">${inline(text)}</p>` : '')
const para = (text, cls = 'body') => (text ? `<p class="${cls}">${inline(text)}</p>` : '')
const bullets = (items) => (items?.length ? `<ul class="bullets">${items.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>` : '')

/** Four gauge dots, as many filled as the severity weighs: it reads without colour too. */
const gauge = (severity) =>
  `<span class="gauge sev-${severity}">${Array.from({ length: 4 }, (_, i) => `<i${i < SEVERITIES[severity] ? ' class="on"' : ''}></i>`).join('')}</span>`

/** Lines of a drawn page, varied by position so a row of pages does not look stamped. */
const PAGE_LINES = [
  ['band', 'head w70', 'w100', 'w85', 'w60'],
  ['head w55', 'w100', 'w100', 'w90', 'w100', 'w70', 'w40'],
  ['head w65', 'block', 'w100', 'w80', 'block'],
  ['head w50', 'w100', 'w75', 'w100', 'w88'],
  ['head w65', 'w100', 'cite', 'w82', 'w58'],
]

/** A row of small A4 pages: read (done), being read (active), not there (open). */
const pagesStrip = (pages) =>
  pages?.length
    ? `<div class="pages" style="--n:${pages.length}">${pages
        .map((state, i) => `<span class="page ${state}">${state === 'open' ? '' : PAGE_LINES[i % PAGE_LINES.length].map((l) => `<i class="${l}"></i>`).join('')}</span>`)
        .join('')}</div>`
    : ''

/** A document excerpt: where it is from, the line that matters, and what it contradicts. */
const docHtml = (doc, against) => `
    <div class="doc">
      <p class="doc-meta"><span>${inline(doc.name)}</span>${doc.page ? `<span>${inline(doc.page)}</span>` : ''}</p>
      ${doc.ref ? `<p class="doc-ref">${inline(doc.ref)}</p>` : ''}
      <p class="cite">${inline(doc.quote)}</p>
      ${against ? `<p class="doc-meta against"><span>${inline(against.name)}</span><strong>${inline(against.note ?? '')}</strong></p>` : ''}
    </div>`

/** A grey cloud stands in while a brand has no mascot poses yet, so a draft previews. */
const MASCOT_PLACEHOLDER = `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg"><path d="M55 120 a30 30 0 0 1 -5 -59 a38 38 0 0 1 72 -16 a32 32 0 0 1 43 30 a26 26 0 0 1 -10 45 z" fill="#e8e5de" stroke="#c9c4b8" stroke-width="4" stroke-linejoin="round"/><circle cx="85" cy="85" r="5" fill="#8d897e"/><circle cx="125" cy="85" r="5" fill="#8d897e"/><path d="M96 103 q9 7 18 0" fill="none" stroke="#8d897e" stroke-width="4" stroke-linecap="round"/></svg>`

/** A lettered line: `*word*` is the one highlighted word, drawn as a marker swipe behind it. */
const letteredLine = (line) => escapeHtml(line).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>')

const BODIES = {
  cover: (s, ctx) => `
    <div class="lead">
    ${kicker(s.kicker)}
    <h1 class="headline">${inline(s.headline)}</h1>
    ${para(s.subline, 'subline')}
    </div>
    ${pagesStrip(s.pages)}
    ${s.excerpt ? docHtml(s.excerpt) : ''}
    ${imageHtml(s.image, { ...ctx, fit: s.fit })}`,
  source: (s) => `
    ${kicker(s.kicker)}
    <h2 class="title">${inline(s.title)}</h2>
    ${docHtml(s.doc, s.against)}`,
  finding: (s, ctx) => `
    ${kicker(s.kicker)}
    <div class="finding">
      <p class="finding-bar">${s.id ? `<span class="finding-id">${inline(s.id)}</span>` : ''}${gauge(s.severity)}<span class="chip sev-${s.severity}">${ctx.labels.severity[s.severity]}</span>${s.source ? `<span class="finding-source">${inline(s.source)}</span>` : ''}</p>
      <h2 class="finding-title">${inline(s.title)}</h2>
      ${para(s.body)}
      ${
        s.cost
          ? `<div class="cost">${s.cost.label ? `<p class="cost-label">${inline(s.cost.label)}</p>` : ''}<p class="cost-value">${inline(s.cost.value)}${s.cost.unit ? `<span>${inline(s.cost.unit)}</span>` : ''}</p>${para(s.cost.note, 'source')}</div>`
          : ''
      }
    </div>`,
  status: (s) => `
    ${kicker(s.kicker)}
    <h2 class="title">${inline(s.title)}</h2>
    <div class="panel">
      <div class="progress-head"><p class="progress-value">${escapeHtml(s.percent)} %${s.label ? `<span>${inline(s.label)}</span>` : ''}</p>${s.eta ? `<p class="progress-eta">${inline(s.eta)}</p>` : ''}</div>
      <div class="bar"><i style="width:${Number(s.percent)}%"></i></div>
      <ul class="status-steps">${s.steps
        .map(
          (step) =>
            `<li class="${step.state}"><span class="dot">${step.state === 'done' ? '✓' : step.state === 'waiting' ? '!' : ''}</span><div><strong>${inline(step.title)}</strong>${step.body ? `<span>${inline(step.body)}</span>` : ''}</div>${step.time ? `<span class="time">${inline(step.time)}</span>` : ''}</li>`,
        )
        .join('')}</ul>
    </div>`,
  report: (s) => `
    ${kicker(s.kicker)}
    <h2 class="title">${inline(s.title)}</h2>
    <div class="report">
      <ol class="toc">${s.pages
        .map((name, i) => `<li${i + 1 === s.active ? ' class="active"' : ''}><span>${String(i + 1).padStart(2, '0')}</span><strong>${inline(name)}</strong></li>`)
        .join('')}</ol>
      <div class="sheet-page">
        <p class="sheet-head">${escapeHtml(String(s.active ?? 1).padStart(2, '0'))} · ${inline(s.pages[(s.active ?? 1) - 1] ?? '')}</p>
        <p class="sheet-finding"><span>B-01</span>${gauge('critical')}</p>
        <i class="head w90"></i><i class="head w65"></i><i class="w100"></i><i class="w88"></i><i class="cite"></i><i class="w100"></i><i class="w70"></i>
        <p class="sheet-finding"><span>B-02</span>${gauge('high')}</p>
      </div>
    </div>`,
  gaps: (s, ctx) => {
    const total = s.total ?? s.items.length
    const found = s.found ?? s.items.filter((item) => !item.missing).length
    return `
    ${kicker(s.kicker)}
    <h2 class="title">${inline(s.title)}</h2>
    <div class="panel">
      <div class="progress-head"><p class="gaps-count">${escapeHtml(found)} ${ctx.labels.of} ${escapeHtml(total)} ${inline(s.unit ?? '')}</p>${s.label ? `<p class="progress-eta mono">${inline(s.label)}</p>` : ''}</div>
      <div class="bar thin"><i style="width:${Math.round((Number(found) / Number(total)) * 100) || 0}%"></i></div>
      <ul class="gaps">${s.items
        .map((item) => `<li class="${item.missing ? 'gap' : 'have'}"><span class="dot">${item.missing ? '' : '✓'}</span><strong>${inline(item.name)}</strong><span class="time">${inline(item.missing ? (item.note ?? ctx.labels.gap) : (item.note ?? ''))}</span></li>`)
        .join('')}</ul>
    </div>`
  },
  feature: (s, ctx) => `
    ${kicker(s.kicker)}
    <h2 class="title">${inline(s.title)}</h2>
    ${para(s.body)}
    ${bullets(s.bullets)}
    ${imageHtml(s.image, { ...ctx, fit: s.fit })}`,
  steps: (s) => `
    ${kicker(s.kicker)}
    <h2 class="title">${inline(s.title)}</h2>
    <ol class="steps">${s.steps
      .map((step, i) => `<li><span class="num">${i + 1}</span><div>${step.meta ? `<p class="meta">${inline(step.meta)}</p>` : ''}<h3>${inline(step.title)}</h3>${para(step.body)}</div></li>`)
      .join('')}</ol>`,
  stat: (s) => `
    ${kicker(s.kicker)}
    <p class="stat-value">${inline(s.value)}${s.compare ? `<span class="stat-compare">${inline(s.compare)}</span>` : ''}</p>
    <p class="stat-label">${inline(s.label)}</p>
    ${para(s.body)}
    ${s.source ? `<p class="source">${inline(s.source)}</p>` : ''}`,
  quote: (s, ctx) => `
    ${kicker(s.kicker)}
    <blockquote class="quote">${inline(s.quote)}</blockquote>
    <div class="author">
      ${imageHtml(s.author.image, { ...ctx, className: 'avatar' })}
      <div><p class="author-name">${inline(s.author.name)}</p>${para(s.author.role, 'author-role')}</div>
    </div>`,
  chat: (s, ctx) => `
    ${kicker(s.kicker)}
    ${s.title ? `<h2 class="title">${inline(s.title)}</h2>` : ''}
    <div class="chat">
      <p class="chat-bar"><i></i><i></i><i></i><span>${inline(s.agent ?? ctx.labels.agent)}</span></p>
      ${s.messages
        .map((m) =>
          m.from === 'tool'
            ? `<p class="msg tool"><span>${inline(m.text)}</span></p>`
            : `<p class="msg ${m.from}">${inline(m.text)}</p>`,
        )
        .join('')}
    </div>
    ${para(s.note, 'source')}`,
  cta: (s) => `
    ${kicker(s.kicker)}
    <h2 class="headline">${inline(s.headline)}</h2>
    ${para(s.body, 'subline')}
    ${s.button || s.url ? `<div class="actions">${s.button ? `<p class="button">${inline(s.button)}</p>` : ''}${s.url ? `<p class="url">${inline(s.url)}</p>` : ''}</div>` : ''}`,
  lettered: (s, ctx) => `
    <div class="lettered-lines">${s.lines.map(letteredLine).join('<br>')}</div>
    <div class="mascot">${s.pose && ctx.poses[s.pose] ? `<img src="${escapeHtml(ctx.poses[s.pose])}" alt="">` : MASCOT_PLACEHOLDER}</div>
    ${s.url ? `<p class="lettered-url">${escapeHtml(s.url)}</p>` : ''}
    <p class="dots">${Array.from({ length: ctx.total }, (_, i) => `<i${i === ctx.index ? ' class="on"' : ''}></i>`).join('')}</p>
    ${ctx.footer && !s.url ? `<p class="lettered-footer">${escapeHtml(ctx.footer)}</p>` : ''}`,
}

export function renderSlide(slide, index, doc, { baseDir, brand, total }) {
  const labels = LABELS[langOf(doc, brand)]
  const poses = posesOf(doc, brand, baseDir)
  const footer = doc.footer ?? doc.handle ?? brand.config.handle ?? ''
  const theme = slide.theme ?? doc.theme ?? 'light'
  const last = index === total - 1
  const counter = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
  return `
<section class="slide type-${slide.type} ${theme}${slide.image ? ' has-image' : ''}">
  <header class="chrome">
    ${
      brand.wordmark
        ? `<span class="brand wordmark"><img src="${brand.wordmark[theme === 'dark' ? 'dark' : 'light']}" alt="${escapeHtml(brand.config.name)}"></span>`
        : `<span class="brand">${brand.logo ? `<img src="${brand.logo}" alt="">` : ''}${escapeHtml(brand.config.name)}</span>`
    }
    <span class="counter">${counter}</span>
  </header>
  <main class="content">${BODIES[slide.type](slide, { baseDir, labels, poses, footer, index, total })}</main>
  <footer class="chrome">
    <span class="handle">${inline(doc.handle ?? brand.config.handle ?? '')}</span>
    ${last ? '' : `<span class="swipe">${labels.swipe} <b>→</b></span>`}
  </footer>
</section>`
}

const FONT_FORMATS = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' }

/** The brand's @font-face rules; a missing file falls back to the next font in its stack. */
function fontFaces(brand) {
  const present = brand.fonts.filter((f) => f.url || existsSync(f.file))
  const css = present.map((f) => {
    const src = f.url ?? pathToFileURL(f.file).href
    const format = FONT_FORMATS[path.extname(new URL(src).pathname).toLowerCase()] ?? 'woff2'
    return `@font-face{font-family:'${f.family}';font-weight:${f.weight ?? 400};font-style:${f.style ?? 'normal'};src:url('${src}') format('${format}')}`
  })
  return { css: css.join('\n'), missing: brand.fonts.filter((f) => !present.includes(f)) }
}

export function renderDocument(doc, { baseDir, format = '1080x1350' }) {
  const { width, height, ratio } = FORMATS[format]
  const css = readFileSync(path.join(SKILL_DIR, 'scripts/slides.css'), 'utf8')
  const brand = loadBrand(doc.brand, baseDir)
  const outro = brand.outro(langOf(doc, brand))
  const total = doc.slides.length + (outro ? 1 : 0)
  const slides = doc.slides.map((s, i) => renderSlide(s, i, doc, { baseDir, brand, total }))
  // The brand's closing slide is fixed markup, appended to every carousel of that brand.
  if (outro) {
    const filled = outro
      .replaceAll('{{brandDir}}', pathToFileURL(brand.dir).href)
      .replaceAll('{{repoRoot}}', pathToFileURL(REPO_ROOT).href)
      .replaceAll('{{counter}}', `${String(total).padStart(2, '0')} / ${String(total).padStart(2, '0')}`)
    slides.push(`<section class="slide outro">${filled}</section>`)
  }
  return `<!doctype html>
<html lang="${langOf(doc, brand)}"><head><meta charset="utf-8">
<title>${escapeHtml(doc.title ?? 'Carousel')}</title>
<style>
${fontFaces(brand).css}
:root{--w:${width}px;--h:${height}px}
@page{size:${width}px ${height}px;margin:0}
${brand.theme}
${css}
${brand.layout}
</style></head>
<body class="brand-${brand.id} ratio-${ratio.replace(':', 'x')}">${slides.join('\n')}</body></html>`
}

/**
 * Tokens the shared layout reads with a neutral fallback (`var(--tint, 113 113 122)`) that the
 * brand sets in neither its theme nor its own slides.css. The fallback is the kit's grey, not the
 * brand's colour, so a brand that leaves one out renders grey glows, chips and shadows without
 * an error. A fallback to another token (`var(--x, var(--y))`) is not counted.
 */
export function unsetTokens(brand) {
  const shared = readFileSync(path.join(SKILL_DIR, 'scripts/slides.css'), 'utf8')
  const own = `${brand.theme}\n${brand.layout}`
  return [...new Set([...shared.matchAll(/var\((--[a-z0-9-]+),\s*\d/g)].map((m) => m[1]))].filter(
    (token) => !new RegExp(`${token}\\s*:`).test(own),
  )
}

/** A print document whose pages are exactly the rendered PNGs. */
export function pdfDocument(pngFiles, { width, height }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:${width}px ${height}px;margin:0}
*{margin:0;padding:0}
img{display:block;width:${width}px;height:${height}px;break-after:page}
</style></head><body>${pngFiles.map((f) => `<img src="${pathToFileURL(f).href}" alt="">`).join('')}</body></html>`
}

/**
 * Text that touches an image, a chat or the header/footer, measured in the laid-out page.
 * Slide blocks sit in normal flow, so this only fires when CSS pulls something out of it
 * (a negative margin, an absolutely placed element) or a block overflows into the footer.
 * Runs in the browser.
 */
export function findOverlaps({ minGap, minImage }) {
  const TEXT = '.kicker, .headline, .title, .subline, .content > .body, .bullets, .steps, .stat-value, .stat-label, .quote, .author, .button, .url, .content > .source, .doc, .finding, .panel, .report, .pages'
  const MEDIA = '.shot, .chat'
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom + minGap && b.top < a.bottom + minGap
  const name = (el) => el.className.split(' ')[0]
  return [...document.querySelectorAll('section.slide')].flatMap((slide, i) => {
    const text = [...slide.querySelectorAll(TEXT)].filter((el) => !el.closest('.chat'))
    const media = [...slide.querySelectorAll(MEDIA)]
    const chrome = [...slide.querySelectorAll('.chrome')]
    const found = []
    for (const m of media)
      for (const t of text) if (hit(m.getBoundingClientRect(), t.getBoundingClientRect())) found.push(`${name(t)} and ${name(m)}`)
    for (const c of chrome)
      for (const el of [...text, ...media]) if (hit(c.getBoundingClientRect(), el.getBoundingClientRect())) found.push(`${name(el)} and the ${c.tagName === 'HEADER' ? 'header' : 'footer'}`)
    // Blocks in flow never overlap: too much text squeezes the image instead, which is as bad.
    for (const m of slide.querySelectorAll('.shot')) {
      const h = Math.round(m.getBoundingClientRect().height)
      if (h < minImage) found.push(`the image is squeezed to ${h}px (text above takes the room), cut words`)
    }
    return found.map((f) => `slide ${i + 1}: ${/squeezed/.test(f) ? f : `${f} are closer than ${minGap}px or overlap`}`)
  })
}

/** One format: slides.html, NN.png, carousel.pdf and preview.png in outDir. Returns warnings. */
async function renderFormat(browser, doc, { baseDir, outDir, format }) {
  const { width, height } = FORMATS[format]
  const warnings = []
  mkdirSync(outDir, { recursive: true })
  const htmlFile = path.join(outDir, 'slides.html')
  writeFileSync(htmlFile, renderDocument(doc, { baseDir, format }))
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  try {
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const count = await page.locator('section.slide').count()
    // Text that does not fit is clipped by the slide, not reported by the browser: measure it.
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll('section.slide')].flatMap((slide, i) => {
        const el = slide.querySelector('.content')
        return el && el.scrollHeight > el.clientHeight + 1 ? [`slide ${i + 1}: content is ${el.scrollHeight - el.clientHeight}px taller than the slide, cut words (never shrink the type)`] : []
      }),
    )
    // A lettered line never wraps: one that is wider than the slide is cut by it.
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('section.slide')].flatMap((slide, i) => {
        const el = slide.querySelector('.lettered-lines')
        const content = slide.querySelector('.content')
        return el && content && el.scrollWidth > content.clientWidth + 1 ? [`slide ${i + 1}: a lettered line is ${el.scrollWidth - content.clientWidth}px wider than the slide, cut words`] : []
      }),
    )
    // A remote image (a mascot pose) that did not load renders as an empty slot.
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('section.slide')].flatMap((slide, i) =>
        [...slide.querySelectorAll('img')].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => `slide ${i + 1}: image ${img.getAttribute('src')} did not load`),
      ),
    )
    warnings.push(...wide, ...broken)
    // The image slot shrinks before text overflows; 35 % of the slide height is the floor.
    warnings.push(...overflowing, ...(await page.evaluate(findOverlaps, { minGap: 24, minImage: Math.round(height * 0.35) })))
    // One slide alone in a slide-sized viewport: element screenshots of a stacked page drift
    // by a few pixels per slide and pick up the neighbour's edge.
    await page.evaluate(() => document.body.classList.add('solo'))
    for (let i = 0; i < count; i++) {
      await page.evaluate((n) => document.querySelectorAll('section.slide').forEach((el, j) => el.classList.toggle('on', j === n)), i)
      await page.screenshot({ path: path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`) })
    }
    await page.evaluate(() => document.body.classList.remove('solo'))
    const pngs = Array.from({ length: count }, (_, i) => path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`))
    const printDir = mkdtempSync(path.join(tmpdir(), 'carousel-pdf-'))
    try {
      const printFile = path.join(printDir, 'print.html')
      writeFileSync(printFile, pdfDocument(pngs, { width, height }))
      const printPage = await browser.newPage({ viewport: { width, height } })
      await printPage.goto(pathToFileURL(printFile).href, { waitUntil: 'load' })
      await printPage.pdf({ path: path.join(outDir, 'carousel.pdf'), width: `${width}px`, height: `${height}px`, printBackground: true })
      await printPage.close()
    } finally {
      rmSync(printDir, { recursive: true, force: true })
    }
    await page.evaluate(() => document.body.classList.add('sheet'))
    await page.setViewportSize({ width: Math.ceil(count * width * 0.3 + (count + 1) * 24), height: Math.ceil(height * 0.3 + 48) })
    await page.screenshot({ path: path.join(outDir, 'preview.png') })
  } finally {
    await page.close()
  }
  return warnings
}

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'))
  const strict = argv.includes('--strict')
  const copyOnly = argv.includes('--copy')
  if (args.length !== (copyOnly ? 1 : 2)) {
    console.error('usage: render.mjs <carousel.json> <out-dir> [--strict]\n       render.mjs <carousel.json> --copy')
    return 2
  }
  const [input, outDir] = args.map((a) => path.resolve(a))
  let doc
  try {
    doc = JSON.parse(readFileSync(input, 'utf8'))
  } catch (err) {
    console.error(`cannot read ${input}: ${err.message}`)
    return 2
  }
  const baseDir = path.dirname(input)
  const errors = validateCarousel(doc, { baseDir })
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`)
    return 2
  }

  if (copyOnly) {
    console.log(extractCopy(doc))
    return 0
  }

  const brand = loadBrand(doc.brand, baseDir)
  const poses = posesOf(doc, brand, baseDir)
  const cropWarnings = await runCrops(doc, outDir)
  const missing = doc.slides
    .flatMap((s, i) => [s.image, s.author?.image].filter(Boolean).map((src) => [i, src]))
    .filter(([, src]) => !existsSync(path.resolve(baseDir, src)))
    .map(([i, src]) => `slide ${i + 1}: image ${src} not found, rendered as placeholder`)
  const lettered = doc.slides.flatMap((s, i) =>
    s.type !== 'lettered'
      ? []
      : [
          ...(s.pose && !poses[s.pose] ? [`slide ${i + 1}: pose "${s.pose}" is not in the brand's mascot.poses, rendered as placeholder`] : []),
          ...(!s.alt ? [`slide ${i + 1}: no alt text`] : []),
        ],
  )
  const warnings = [...findPlaceholders(doc), ...cropWarnings, ...missing, ...lettered]
  const missingFonts = fontFaces(brand).missing
  if (missingFonts.length) warnings.push(`brand fonts not found (install the app's dependencies?): ${[...new Set(missingFonts.map((f) => f.family))].join(', ')}, rendered with the fallback`)
  const unset = unsetTokens(brand)
  if (unset.length) warnings.push(`brand theme leaves ${unset.join(', ')} to the layout's grey fallback: set them from the brand's colours`)


  const formats = doc.formats ?? DEFAULT_FORMATS
  const browser = await launchChromium()
  try {
    for (const format of formats) {
      const found = await renderFormat(browser, doc, { baseDir, outDir: path.join(outDir, format), format })
      warnings.push(...found.map((w) => `${format} ${w}`))
    }
  } finally {
    await browser.close()
  }

  if (doc.slides.some((s) => s.alt))
    writeFileSync(path.join(outDir, 'alt.md'), doc.slides.map((s, i) => `${String(i + 1).padStart(2, '0')}: ${s.alt ?? ''}`).join('\n') + '\n')

  for (const w of warnings) console.warn(`${strict ? '✗' : '!'} ${w}`)
  const outro = brand.outro(langOf(doc, brand)) ? ' + closing slide' : ''
  console.log(`rendered ${doc.slides.length} slides${outro} (${brand.id}) in ${formats.join(', ')} → ${outDir}`)
  return strict && warnings.length ? 1 : 0
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err)
      process.exit(2)
    },
  )
}
