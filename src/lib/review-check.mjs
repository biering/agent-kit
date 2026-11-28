/**
 * Checks for the two texts the owner reads (rules/spec-review.md §2, rules/result-review.md §2): the spec
 * brief and the result pitch. Each check names what is missing in words the agent can act on. The agent
 * runs them before it stops (`agent-kit review check <file> --kind spec|result`); the review list shows
 * the same findings on the row's detail, so a gap is visible before the owner opens the brief.
 *
 * Pure: a text in, findings out (test/review-list.test.mjs).
 */
import { allLinks } from './review.mjs'

/** The sections each text needs, in order of the template. Matched as `## <name>` at the start of a line. */
export const SECTIONS = {
  spec: ['Why', 'What the user gets', 'Scenarios', 'Design', 'Tasks', 'Complexity', 'Open'],
  result: ['What the user gets', 'Why we should add it', 'Complexity', 'See it', 'Risk and undo', 'Distribution', 'Recommendation'],
}

/**
 * "No screen changes." (or "No UI change", "Nothing visible changes") lifts the media check of a pitch and the design
 * check of a brief, but only as a line of its own in that section (See it, Design): a sentence elsewhere, or one
 * that goes on ("No UI changes to the admin screens, only …"), never counts.
 */
export const NO_SCREENS = /^[ \t]*[-*]?[ \t]*(?:no (?:screens?|ui|visible|user-visible) changes?|nothing (?:a user sees|visible) changes)[ \t]*[.!]?[ \t]*$/im

/**
 * What the app is, from a `Platform: <kind>` line in the pitch (rules/result-review.md §2, "Native apps"), and
 * the screenshots each kind needs. Default web.
 *   web      a Playwright recording of the branch; screenshots at desktop and phone width
 *   ios      an Expo, React Native or Swift app: the simulator (xcrun simctl io <udid> recordVideo); phone screenshots
 *   desktop  a Tauri or Electron app: its frontend in the browser (IPC mocked); desktop screenshots, and a still
 *            of the real window ("window") or the line "No window still: <why>"
 *   menubar  a menu bar app: the video skill's product-ui recorder of its real components; the same stills as desktop
 */
export const PLATFORMS = {
  web: ['desktop', 'phone'],
  ios: ['phone'],
  desktop: ['desktop', 'window'],
  menubar: ['desktop', 'window'],
}
const SHOT = {
  desktop: [/desktop|1440|wide/i, 'no desktop screenshot (label it "desktop")'],
  phone: [/phone|mobile|390|iphone/i, 'no phone screenshot (label it "phone")'],
  window: [/window/i, 'no still of the real window (label it "window"), or the line "No window still: <why>" under See it'],
}
const ALIASES = { expo: 'ios', 'react-native': 'ios', iphone: 'ios', tauri: 'desktop', electron: 'desktop', mac: 'desktop', macos: 'desktop', 'menu-bar': 'menubar', tray: 'menubar' }

/** The platform a pitch names (`Platform: tauri` → desktop), or web. An unknown name is returned as it is. */
export function platformOf(text = '') {
  const m = /^\s*[-*]?\s*\**platform\**\s*:\s*\**\s*([a-z][a-z-]*)/im.exec(String(text))
  if (!m) return 'web'
  const k = m[1].toLowerCase()
  return ALIASES[k] ?? k
}

/** "No window still: <why>" on a line of its own: the session could not capture the real window. */
export const NO_WINDOW = /^[ \t]*[-*]?[ \t]*no window still[ \t]*:[ \t]*\S.*$/im

/** The body of a `## name` section, up to the next heading of the same or a higher level. */
export function section(text, name) {
  const lines = String(text).split('\n')
  const want = name.toLowerCase()
  const start = lines.findIndex((l) => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().toLowerCase().startsWith(want))
  if (start === -1) return null
  const out = []
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,2}\s+/.test(l)) break
    out.push(l)
  }
  return out.join('\n').trim()
}

/**
 * Findings for a brief (kind spec) or a pitch (kind result): [{ level: 'error'|'warn', what }].
 * error: the owner cannot decide from it (a missing section, a missing link, a placeholder).
 * warn: it reads worse than it should (an em dash, a long one line).
 */
export function check(kind, text = '', { unarchived = false } = {}) {
  const t = String(text)
  const out = []
  const err = (what) => out.push({ level: 'error', what })
  const warn = (what) => out.push({ level: 'warn', what })
  if (!SECTIONS[kind]) return [{ level: 'error', what: `unknown kind "${kind}" (spec or result)` }]
  if (!t.trim()) return [{ level: 'error', what: 'the text is empty' }]
  if (!/^#\s+\S/m.test(t)) err('no title line (`# Spec: …` or `# Result: …`)')
  for (const name of SECTIONS[kind]) {
    const body = section(t, name)
    if (body === null) err(`no "## ${name}" section`)
    else if (!body.replace(/<!--[\s\S]*?-->/g, '').trim()) err(`"## ${name}" is empty`)
  }
  const links = allLinks(t)
  if (kind === 'spec') {
    if (!/openspec\/changes\/[a-z0-9][a-z0-9._-]*/i.test(t)) err('no `Change: openspec/changes/<name>` line')
    const scenarios = section(t, 'Scenarios') ?? ''
    if (scenarios && !/\bWHEN\b[\s\S]*?\bTHEN\b/.test(scenarios)) err('the scenarios have no WHEN … THEN')
    const design = section(t, 'Design') ?? ''
    if (design && !links.some((l) => l.type === 'artifact') && !NO_SCREENS.test(design)) err('no design artifact link (or "No screen changes." on a line of its own under Design)')
    const complexity = section(t, 'Complexity') ?? ''
    if (complexity && !/\b(?:worth|because|cut|instead|so that|keeps?)\b/i.test(complexity)) warn('Complexity says what it adds but not why it is worth it (or what was cut)')
  }
  if (kind === 'result') {
    // No pull request link is needed: the board opens the PR after the agent ends, and the review list adds it.
    const see = section(t, 'See it') ?? ''
    const noScreens = NO_SCREENS.test(see)
    const platform = platformOf(t)
    if (!PLATFORMS[platform]) err(`unknown Platform "${platform}" (web, ios, desktop or menubar)`)
    if (!noScreens) {
      if (!links.some((l) => l.type === 'video')) err('no video link (an .mp4 of the changed flow); with no screen change, put "No screen changes." on a line of its own under See it')
      const shots = links.filter((l) => l.type === 'image')
      for (const need of PLATFORMS[platform] ?? PLATFORMS.web) {
        const [re, what] = SHOT[need]
        if (need === 'window' && NO_WINDOW.test(see)) continue
        if (!shots.some((l) => re.test(`${l.label} ${l.url}`))) err(what)
      }
    }
    if (unarchived) err('its OpenSpec change is not archived yet: run agent-kit spec archive <name> and commit it before you end the turn')
    const risk = section(t, 'Risk and undo') ?? ''
    if (risk && !/\b(?:revert|undo|roll ?back|flag|switch off|turn off|restore)\b/i.test(risk)) err('Risk and undo does not say how to undo it')
    const rec = section(t, 'Recommendation') ?? ''
    if (rec && !/\b(?:ship|hold|wait|cut|drop|don't|do not)\b/i.test(rec)) err('the recommendation does not say ship, hold or cut')
    const dist = section(t, 'Distribution') ?? ''
    if (dist && !/not live|no post|draft|post|clip|changelog|launch/i.test(dist)) warn('Distribution names no reuse and does not say the product is not live')
  }
  // Common to both: whole links, no placeholders, no em dashes.
  if (/https:\/\/claude\.ai\/(?:code\/)?artifact\/(?:<id>|…|\.\.\.)/.test(t) || /…\/(?:artifact|pull)\b|\/pull\/<n>/.test(t)) err('a shortened or placeholder link: every link is the whole URL')
  const ph = t.match(/\[PLACEHOLDER[^\]]*\]|<(?:id|n|name|product|one line|what [^>]*|the [^>]*)>/i)
  if (ph) err(`a placeholder is left: ${ph[0]}`)
  if (/—/.test(t)) warn('an em dash: use a colon, a comma or a full stop')
  return out
}

/** True when nothing blocks: no error (warnings allowed). */
export const passes = (findings) => !findings.some((f) => f.level === 'error')
