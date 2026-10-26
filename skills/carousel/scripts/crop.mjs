#!/usr/bin/env node
/**
 * Cut the part of a screenshot a slide needs (`carousel` skill).
 *
 *   node .agents/skills/carousel/scripts/crop.mjs <in.png> <out.png> --x=0 --y=0 --w=1344 --h=700 [--pad=48] [--bg=#f4f4f5]
 *     [--canvas=900x620 --align=right]
 *
 * x/y/w/h are source pixels (read them off the original, e.g. in Preview's inspector).
 * --pad adds a margin in --bg around the cut, for a small UI element (a button) that would
 * otherwise touch the edges of the slide's image slot. The slot is roughly 900 × 620 px and
 * scales the image to fill it, so a cut at that aspect ratio (≈ 3:2) shows without trimming.
 * --canvas places a small cut (a button, a badge) on a slot-shaped canvas in --bg instead of
 * cutting a big region of empty UI around it; --align=left|center|right sets where it sits
 * (vertically centred). --bg defaults to auto with --canvas: the colour of the cut's top-left
 * pixel, because a hand-picked grey that is one shade off leaves a visible seam.
 * Exit 0 = written, 2 = usage.
 */
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { launchChromium } from './repo.mjs'

export function parseArgs(argv) {
  const files = argv.filter((a) => !a.startsWith('--'))
  const opts = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')))
  const num = (k, d) => (opts[k] === undefined ? d : Number(opts[k]))
  const box = { x: num('x', 0), y: num('y', 0), w: num('w'), h: num('h'), pad: num('pad', 0), bg: opts.bg ?? (opts.canvas !== undefined ? 'auto' : '#f4f4f5'), align: opts.align ?? 'center' }
  const errors = []
  if (opts.canvas !== undefined) {
    const m = /^(\d+)x(\d+)$/.exec(opts.canvas)
    if (m) box.canvas = { w: Number(m[1]), h: Number(m[2]) }
    else errors.push('--canvas must look like 900x620')
  }
  if (!['left', 'center', 'right'].includes(box.align)) errors.push('--align must be left, center or right')
  if (files.length !== 2) errors.push('need <in.png> <out.png>')
  for (const k of ['x', 'y', 'w', 'h', 'pad']) if (!Number.isFinite(box[k]) || box[k] < 0) errors.push(`--${k} must be a number ≥ 0`)
  if (!(box.w > 0 && box.h > 0)) errors.push('--w and --h are required and > 0')
  if (box.canvas && (box.canvas.w < box.w + 2 * box.pad || box.canvas.h < box.h + 2 * box.pad)) errors.push('--canvas must be at least the cut plus its padding')
  return { files, box, errors }
}

/** Cut `box` out of `input` into `output` (PNG) with an already-launched browser. */
export async function cropImage(browser, { input, output, box }) {
  const width = box.canvas?.w ?? box.w + 2 * box.pad
  const height = box.canvas?.h ?? box.h + 2 * box.pad
  const justify = { left: 'flex-start', center: 'center', right: 'flex-end' }[box.align]
  const dir = mkdtempSync(path.join(tmpdir(), 'carousel-crop-'))
  const html = path.join(dir, 'crop.html')
  writeFileSync(
    html,
    `<!doctype html><body style="margin:0;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:${justify};background:${box.bg === 'auto' ? '#fff' : box.bg}"><div style="flex:none;margin:${box.pad}px;width:${box.w}px;height:${box.h}px;background:url('${pathToFileURL(input).href}') -${box.x}px -${box.y}px no-repeat"></div></body>`,
  )
  const page = await browser.newPage({ viewport: { width, height } })
  try {
    await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
    if (box.bg === 'auto') {
      const bg = await page.evaluate(async ({ src, x, y }) => {
        const img = new Image()
        img.src = src
        await img.decode()
        const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d')
        ctx.drawImage(img, x, y, 1, 1, 0, 0, 1, 1)
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        return `rgb(${r}, ${g}, ${b})`
      }, { src: pathToFileURL(input).href, x: box.x, y: box.y })
      await page.evaluate((c) => { document.body.style.background = c }, bg)
    }
    await page.screenshot({ path: output, clip: { x: 0, y: 0, width, height } })
  } finally {
    await page.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return { width, height }
}

/** A browser that may read pixels of file:// images (needed for --bg=auto). */
export async function launchCropBrowser() {
  // Reading a pixel of a file:// image counts as cross-origin unless file access is allowed.
  return launchChromium({ args: ['--allow-file-access-from-files'] })
}

async function main(argv) {
  const { files, box, errors } = parseArgs(argv)
  if (errors.length) {
    console.error(`${errors.join('\n')}\nusage: crop.mjs <in.png> <out.png> --x= --y= --w= --h= [--pad=] [--bg=] [--canvas=WxH --align=]`)
    return 2
  }
  const [input, output] = files.map((f) => path.resolve(f))
  const browser = await launchCropBrowser()
  try {
    const { width, height } = await cropImage(browser, { input, output, box })
    console.log(`${path.relative(process.cwd(), output)}: ${width} × ${height}`)
  } finally {
    await browser.close()
  }
  return 0
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
