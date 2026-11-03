#!/usr/bin/env node
// Angle batch: one product, N carousels that vary one dimension. Writes a folder per angle from a
// template carousel (experiment block filled in) and matrix.md, the table for the register.
// Usage: node batch.mjs <batch.json> <out-dir> [--date YYYY-MM-DD]
//
// batch.json: { "name": "launch", "dimension": "problem", "fixed": { "audience": "...", "hook": "...", "benefit": "..." },
//               "angles": [{ "id": "late", "value": "..." }, ...], "template": "<carousel.json>", "link": "https://example.com/landing" }
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMatrix, matrixMarkdown } from './campaign.mjs'

/** The files of a batch, as { path: content }: no disk access, so a test can read them. */
export function scaffold(batch, template, { date } = {}) {
  const { errors, rows } = buildMatrix(batch, { date })
  if (errors.length) return { errors, files: {} }
  const files = { 'matrix.md': matrixMarkdown(batch, rows) }
  for (const row of rows) {
    const doc = {
      ...template,
      title: row.slug,
      experiment: { slug: row.slug, angle: { dimension: row.dimension, value: row.value }, fixed: row.fixed, platforms: row.platforms, ...(row.link ? { link: row.link } : {}) },
    }
    delete doc.score
    delete doc.cover
    files[`${row.folder}/carousel.json`] = JSON.stringify(doc, null, 2) + '\n'
  }
  return { errors, files, rows }
}

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'))
  const dateAt = argv.indexOf('--date')
  const date = dateAt >= 0 ? argv[dateAt + 1] : undefined
  if (args.length < 2 || (dateAt >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(date ?? ''))) {
    console.error('usage: batch.mjs <batch.json> <out-dir> [--date YYYY-MM-DD]')
    return 2
  }
  const input = path.resolve(args[0])
  const outDir = path.resolve(args[1])
  const batch = JSON.parse(readFileSync(input, 'utf8'))
  const templateFile = batch.template ? path.resolve(path.dirname(input), batch.template) : null
  if (!templateFile || !existsSync(templateFile)) {
    console.error('✗ "template" is the carousel.json every angle starts from (a path relative to batch.json)')
    return 2
  }
  const { errors, files, rows } = scaffold(batch, JSON.parse(readFileSync(templateFile, 'utf8')), { date })
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`)
    return 2
  }
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(outDir, file)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  // caption.md and replies.md start from the template's, so each angle only rewrites the words.
  for (const row of rows)
    for (const name of ['caption.md', 'replies.md']) {
      const from = path.join(path.dirname(templateFile), name)
      if (existsSync(from)) copyFileSync(from, path.join(outDir, row.folder, name))
    }
  console.log(`${rows.length} carousels varying ${batch.dimension} → ${outDir}`)
  return 0
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)))
