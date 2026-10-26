#!/usr/bin/env node
/**
 * Trace column names to call sites across a repository.
 * Usage: node field-usage.mjs [--root <dir>] [--definitions <regex>] <column> [column...]
 * --root defaults to the current directory. Hits in schema definitions (migrations, generated
 * types, enum files, plus anything matching --definitions) do not count as readers.
 * Prints a JSON summary per column.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CODE_EXTENSIONS = new Set([
  '.astro',
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
  '.vue',
  '.sql',
  '.py',
])
const SKIP_DIRECTORIES = new Set([
  '.agents',
  '.claude',
  '.codex',
  '.cursor',
  '.git',
  '.nuxt',
  '.output',
  '.next',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'vendor',
])

export const DEFINITION_PATTERNS = [
  /(?:^|\/)migrations\//,
  /database\.types\.ts$/,
  /(?:^|\/)enums\.ts$/,
  /(?:^|[./])generated\.[jt]s$/,
]

export function collectCodeFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue
    const absolute = join(directory, entry)
    const stats = statSync(absolute)
    if (stats.isDirectory()) {
      collectCodeFiles(absolute, files)
    } else if (CODE_EXTENSIONS.has(extname(entry))) {
      files.push(absolute)
    }
  }
  return files
}

/** Match column as a whole identifier (snake_case or quoted). */
export function matchesColumn(content, column) {
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(
    `(?:^|[^A-Za-z0-9_])(?:['"\`]?)${escaped}(?:['"\`]?)(?![A-Za-z0-9_])`,
  )
  return re.test(content)
}

export function findUsages(
  column,
  { root = process.cwd(), definitions = DEFINITION_PATTERNS } = {},
) {
  const base = resolve(root)
  const hits = []
  for (const file of collectCodeFiles(base)) {
    const content = readFileSync(file, 'utf8')
    if (!matchesColumn(content, column)) continue
    const rel = relative(base, file)
    hits.push({ file: rel, isDefinition: definitions.some((re) => re.test(rel)) })
  }
  const readers = hits.filter((h) => !h.isDefinition).map((h) => h.file)
  return {
    column,
    unread: readers.length === 0,
    readerCount: readers.length,
    readers: readers.sort(),
    definitions: hits.filter((h) => h.isDefinition).map((h) => h.file).sort(),
  }
}

export function summarizeColumns(columns, options) {
  return columns.map((column) => findUsages(column, options))
}

export function parseArgs(argv) {
  const columns = []
  let root = process.cwd()
  const definitions = [...DEFINITION_PATTERNS]
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = argv[++i]
    else if (argv[i] === '--definitions') definitions.push(new RegExp(argv[++i]))
    else columns.push(argv[i])
  }
  return { columns, root, definitions }
}

function main(argv = process.argv.slice(2)) {
  const { columns, root, definitions } = parseArgs(argv)
  if (columns.length === 0) {
    console.error(
      'Usage: node field-usage.mjs [--root <dir>] [--definitions <regex>] <column> [column...]',
    )
    process.exit(1)
  }
  console.log(JSON.stringify(summarizeColumns(columns, { root, definitions }), null, 2))
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
}
