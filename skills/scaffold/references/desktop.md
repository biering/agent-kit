# Architecture: desktop (Tauri v2 + React)

Target: `apps/<slug>/desktop`. A Rust (Tauri v2) shell around a Vite + React webview. It **is** a
workspace member (unlike mobile) — its frontend uses catalog refs and turbo tasks — but the native
bundle is built by the Tauri toolchain (Rust), not turbo.

## Stack (fixed)

| Concern | Choice |
|---|---|
| Shell | **Tauri v2** (`@tauri-apps/api` + `@tauri-apps/cli`, Rust `tauri = "2"`) |
| Frontend | **Vite 6 + React 19** (`@vitejs/plugin-react`) |
| Styling / UI | **Tailwind v4** (`@tailwindcss/vite`, CSS-first) + **coss UI** on Base UI (`@coss` registry, `cva`/`clsx`/`tailwind-merge`, `lucide-react`) |
| Validation | **zod** for any JS-side input/config; serde (`#[serde(default)]`) on the Rust side |
| Plugins | `@tauri-apps/plugin-{opener,process,store,updater}` (+ Rust crates) as needed |
| Lint/format | Biome (`extends: "//"`) |
| Release | `tauri build` → signed installers + minisign-signed updater feed |

Catalog refs (frontend): `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`, `@types/react*`,
`typescript`. Tauri packages are pinned directly (`@tauri-apps/*`), not catalog.

## Scaffold with the native CLI

```bash
pnpm create tauri-app@latest apps/<slug>/desktop --template react-ts --manager pnpm
cd apps/<slug>/desktop
```

`create-tauri-app` (template **react-ts**) gives the canonical layout: `src-tauri/` (with `main.rs`
calling `_lib::run()` in `lib.rs`), a Vite + React frontend, `beforeDevCommand`/`devUrl` on port 1420,
HMR 1421. Then adapt to the monorepo:

- **Swap in catalog refs** for react/react-dom/tailwindcss/@tailwindcss/vite/@types/react*/typescript.
- **Tailwind v4 + coss UI** — add `@tailwindcss/vite` to `vite.config.ts` plugins, then
  `pnpm dlx shadcn@latest init @coss/style` (discard any Next `layout.tsx` / `app/` the CLI wrote;
  this is Vite). Add only the primitives the core feature needs:
  `pnpm dlx shadcn@latest add @coss/button @coss/card @coss/input @coss/label`.
  `src/lib/utils.ts` = `cn()`. `@coss/style` generates `src/styles/global.css` with `@theme inline`
  oklch tokens — keep that file as the single theme source and restyle tokens per DESIGN.md.
  After primitives exist, read `.agents/skills/coss/SKILL.md` then
  `.agents/skills/coss-particles/SKILL.md` before composing screens.
- **`biome.json`** — `extends: "//"` + `files.includes` (`src/**`, `vite.config.ts`, `package.json`,
  `tsconfig.json`).
- **`tsconfig.json`** — extend the app's `tsconfig.base.json`, `@/*` → `src/*`, `types: ["vite/client"]`.
- **Add Tauri plugins** only as needed: `pnpm add @tauri-apps/plugin-store` (persisted config),
  `plugin-updater` (self-update), `plugin-process` (relaunch), `plugin-opener` (open URLs); register the
  matching Rust crates in `Cargo.toml` and `.plugin(...)` in `lib.rs`, and grant them in
  `src-tauri/capabilities/default.json`.

## Scripts

```jsonc
{
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "tauri": "tauri",
    "vite:dev": "vite",
    "vite:build": "tsc --noEmit && vite build",
    "format": "biome format .", "lint": "biome lint .", "check": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

## Conventions

- **Commands & permissions:** Rust `#[tauri::command]` fns registered via `generate_handler!` in
  `lib.rs`; each custom command needs a permission (`src-tauri/permissions/<cmd>.toml`) referenced from
  `capabilities/default.json`. Keep the capability surface minimal.
- **Rust ↔ JS:** `invoke<T>()` for commands, `emit`/`listen` for events, `@tauri-apps/plugin-store`
  (`load('config.json', { autoSave: true })`) shared with the Rust `store` plugin for config.
- **zod:** validate any config loaded/parsed on the JS side and any payload crossing `invoke`
  boundaries; mirror the shape with serde `#[serde(default = ...)]` on the Rust side.
- **Multi-window** (optional): one HTML entry point per window (`index.html`, `settings.html`, …) →
  `build.rollupOptions.input: { main: 'index.html', settings: 'settings.html' }` in `vite.config.ts`,
  one `createRoot` per entry, and one window definition per label in `tauri.conf.json` /
  `WebviewWindowBuilder`; list every window label in `capabilities/default.json` `windows`. Adding a
  window means all four — a label missing from `windows` silently loses every plugin permission.
- **One window per flow, not one window with everything.** Settings holds settings; a transient
  self-contained flow with its own success state (updating, onboarding, licensing) gets its own
  small window rather than a card stacked above the settings controls. Cheap to add — an HTML entry
  plus the four registrations above.
- **Accessory apps hide windows, they don't close them.** With a menu-bar/tray app, intercept
  `CloseRequested` (`api.prevent_close()` + `window.hide()`) so state survives, and re-show via an
  event the webview listens for. On macOS only drop back to `ActivationPolicy::Accessory` once **no**
  window is still visible — flipping it whenever any one window closes yanks the dock icon and menu
  bar out from under the windows that are still open.
- **Live preview is not saved state.** A settings window that pushes its in-progress draft to the
  render surface (live preview) must push the *saved* config back when it closes without Apply —
  otherwise the preview survives the close and the app looks like it saved changes it didn't (the
  store only reverts on restart, so the lie holds for the whole session). A window that needs an
  unsaved-changes prompt owns its close in the **webview** — `getCurrentWindow().onCloseRequested`
  → `event.preventDefault()` → prompt → hide + `invoke('finish_auxiliary_window')` — and must **not**
  also have the Rust `CloseRequested` hide attached, or Rust hides it out from under the prompt.
  Read `dirty` through a ref: the handler is registered once and would otherwise capture a stale value.

## Auto-update (required when the app self-updates)

Full pattern with code — the dedicated updates window, tray wiring, release-workflow stamping +
version assertion, Release Please config: **`desktop.md`**. The short version: one
version source of truth stamped at release time (including the macOS About panel), assert the built
bundle's version before publishing, give the update UI its own window with a progress bar and
visible errors, and make restart an explicit user action.

## Release (separate workflow — see `deploy.md` (CI))

PR CI builds the **frontend only** (`typecheck` + `test` + `vite:build`) on Linux; it does not compile
Rust. The signed native bundle is built on `macos-latest` (or a platform matrix) via
`tauri-apps/tauri-action@v0` on release, importing signing certs from secrets and publishing updater
artifacts (minisign-signed `latest.json` + installers) — workflow skeleton and the two load-bearing
steps in `desktop.md`. Add this only when the app actually ships installers.

Licensing/payments for a paid download (one-time purchase unlocked by a license key — e.g. Polar or
Lemon Squeezy — validated against the vendor API and stored in the OS keychain) is an optional
module — add per intake, not by default.

## Desktop auto-update (Tauri v2) — robust pattern

`tauri-plugin-updater` + a minisign-signed static `latest.json` is the standard Tauri 2 update
stack (hosted alternative: CrabNebula Cloud). The mechanism is solid; releases go wrong in the
wiring. Five rules, each learned from a real incident (a release shipped a bundle self-reporting
the previous version — every install offered the update forever, and "Install" looked like it did
nothing):

1. **One version source of truth, stamped at release time.** The built app's version comes from
   `tauri.conf.json` — not your workflow input, not `package.json`. The release workflow stamps the
   release version into every version file **before** `tauri build`.
2. **Assert after build.** Read the built bundle's version and fail the release if it differs from
   what `latest.json` will advertise. A mismatch means an infinite update loop for every user.
3. **Release Please gotcha:** `extra-files` paths resolve **relative to the package path**, not the
   repo root. Repo-root paths are *silently skipped*. Files outside the package dir can't be
   extra-files — derive their version (import the app's `package.json`) instead of duplicating it.
4. **Update UI shows progress and errors.** Never `download_and_install(|_, _| {}, || {})` with
   empty callbacks; never `eprintln!`-only errors. Drive the flow from the webview. For
   menu-bar/accessory apps, restart must be an explicit user action — an automatic relaunch is
   invisible and reads as "nothing happened".
5. **The update UI gets its own window** — not a card bolted onto Settings. Updating is a
   transient, self-contained flow with its own success state; parked above the settings controls
   it pushes the real content down, scrolls away, and makes "Check for Updates…" open a window the
   user did not ask for. A dedicated window also means every check is *interactive* (no silent /
   visible mode split) and the window is sized for the flow instead of inheriting the settings layout.

#### Client setup

`Cargo.toml`: `tauri-plugin-updater = "2"`, `tauri-plugin-process = "2"`. `lib.rs`:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
```

JS deps: `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`.

`src-tauri/capabilities/default.json` — the permissions **and** the label of the window that
renders the UI. A window missing from `windows` gets no permissions, and `check()` fails there with
a permission error that looks like a network failure:

```json
"windows": ["main", "settings", "updates"],
"permissions": ["updater:default", "process:allow-restart"]
```

`tauri.conf.json`:

```jsonc
{
  "bundle": { "targets": ["app", "dmg"], "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<contents of updater.key.pub>",
      "endpoints": ["https://<domain>/updates/desktop/latest.json"]
    }
  }
}
```

Generate the minisign keypair once (`pnpm tauri signer generate -w ~/.updater.key`); the public key
goes in the config, the private key + password become CI secrets
(`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Never commit the private key.

#### Update UI (its own window)

Four places register the window — miss one and it fails in a different way (blank window, missing
`updates.html`, denied `check()`):

| File | Add |
|---|---|
| `updates.html` (repo root, next to `index.html`) | entry that mounts `src/updates.tsx` |
| `vite.config.ts` | `build.rollupOptions.input.updates` → that HTML file |
| `src-tauri/tauri.conf.json` | `app.windows[]` entry: `{ "label": "updates", "url": "updates.html", "visible": false, "width": 420, "height": 220, "resizable": false, "center": true }` |
| `src-tauri/capabilities/default.json` | `"updates"` in `windows` |

`src/updates.tsx` is a normal `createRoot` entry that renders the panel and re-shows the window on
`show-updates-window` (the window hides rather than closes, so re-opening is a `show()`):

```tsx
function Updates() {
  useEffect(() => {
    const unlisten = listen('show-updates-window', () => {
      void (async () => {
        const win = getCurrentWindow()
        await win.show()
        await win.unminimize()
        await win.setFocus()
      })()
    })
    return () => void unlisten.then((fn) => fn())
  }, [])
  return <UpdatePanel />
}
```

Full panel — checks on open and on every `check-for-updates`, download progress bar, inline errors
with retry, explicit restart. Because it owns the window it never renders `null`: the idle state
shows the current version and a check button.

```tsx
import { getVersion } from '@tauri-apps/api/app'
import { listen } from '@tauri-apps/api/event'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useCallback, useEffect, useRef, useState } from 'react'

const CHECK_TIMEOUT_MS = 30_000

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; update: Update }
  | { phase: 'downloading'; update: Update; downloaded: number; total: number | null }
  | { phase: 'installing'; update: Update }
  | { phase: 'ready'; update: Update }
  | { phase: 'error'; message: string }

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('Update check timed out.')), ms)
    }),
  ])
}

export function UpdatePanel() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [currentVersion, setCurrentVersion] = useState('')
  const busyRef = useRef(false)

  useEffect(() => {
    void getVersion().then(setCurrentVersion)
  }, [])

  // No silent/interactive split: the user opened this window, so every check reports.
  const runCheck = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setState({ phase: 'checking' })
    try {
      const update = await withTimeout(check(), CHECK_TIMEOUT_MS)
      setState(update ? { phase: 'available', update } : { phase: 'up-to-date' })
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      busyRef.current = false
    }
  }, [])

  useEffect(() => {
    void runCheck()
    const unlisten = listen('check-for-updates', () => void runCheck())
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [runCheck])

  const handleInstall = useCallback(async (update: Update) => {
    if (busyRef.current) return
    busyRef.current = true
    setState({ phase: 'downloading', update, downloaded: 0, total: null })
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setState({
              phase: 'downloading', update, downloaded: 0,
              total: event.data.contentLength ?? null,
            })
            break
          case 'Progress':
            setState((cur) =>
              cur.phase === 'downloading'
                ? { ...cur, downloaded: cur.downloaded + event.data.chunkLength }
                : cur,
            )
            break
          case 'Finished':
            setState({ phase: 'installing', update })
            break
        }
      })
      setState({ phase: 'ready', update })
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      busyRef.current = false
    }
  }, [])

  // Fills the window: status block at the top, one action button pinned at the bottom
  // (`flex min-h-screen flex-col justify-between`). Per phase — 'idle'/'up-to-date' → current
  // version + "Check again"; 'available' → release notes + Install (handleInstall);
  // 'downloading'/'installing' → progress bar (downloaded/total, indeterminate when total is null
  // or installing) + MB counter; 'ready' → "Restart now" (relaunch()); 'error' → message +
  // "Try again" (runCheck). Style with your app's UI kit.
  return (/* ... */)
}
```

Tray / app-menu wiring (Rust) — present the updates window, then hand off to the webview:

```rust
"check-updates" => {
    // Update UI lives in its own window (UpdatePanel listening for `check-for-updates`).
    if let Err(err) = present_window(app, "updates") {
        eprintln!("updates window failed: {err}");
    }
    let _ = app.emit("show-updates-window", ());
    let _ = app.emit("check-for-updates", ());
}
```

Two events, because they answer different questions: `show-updates-window` re-shows a window that
was hidden on close, `check-for-updates` restarts the check in a window that is already open.

#### About panel version (macOS)

If the app builds a menu with `PredefinedMenuItem::about(.., Some(AboutMetadata { .. }))`, two
separate things go wrong — both in the one dialog users open to check what they are running.

```rust
AboutMetadata {
    name: Some("App".into()),
    version: Some(app.package_info().version.to_string()), // never a literal
    short_version: Some(String::new()),                    // suppresses "(build)"
    ..Default::default()
}
```

1. **Never hardcode the version.** A literal drifts on the first release and ships
   `Version 0.4.0 (0.5.1)` to every user — the same mislabeled-version bug as rule 1.
2. **An empty `short_version` is what removes the parenthetical.** AppKit renders
   `Version {ApplicationVersion} ({Version})` and appends the parenthetical whenever `Version` is
   non-empty — *even when it is identical* to `ApplicationVersion`. muda maps `version` →
   `ApplicationVersion` and `short_version` → `Version`; omitting `short_version` falls back to
   `CFBundleVersion`, which the bundler always sets, so omitting it is not enough.

Verified against AppKit in a real bundle with `CFBundleShortVersionString` = `CFBundleVersion` =
`0.5.2`:

| `short_version` | panel shows |
|---|---|
| omitted | `Version 0.5.2 (0.5.2)` |
| `Some("0.5.2")` | `Version 0.5.2 (0.5.2)` |
| `Some("")` | `Version 0.5.2` |

To re-check: build a throwaway `.app` (Info.plist + a `swiftc`'d binary calling
`orderFrontStandardAboutPanel`) and walk the panel's `NSTextField` subviews. Reasoning about this
from the docs gets it wrong.

#### Hosting

A static `latest.json` + the `.app.tar.gz` + `.sig` on any static host/CDN (e.g. an R2 bucket
proxied by the web app's Worker at `/updates/desktop/*`). Manifest shape:

```json
{
  "version": "1.2.3",
  "notes": "…",
  "pub_date": "2026-01-01T00:00:00Z",
  "platforms": {
    "darwin-aarch64": { "signature": "<contents of .sig>", "url": "https://<domain>/updates/desktop/App_1.2.3_universal.app.tar.gz" },
    "darwin-x86_64":  { "signature": "<contents of .sig>", "url": "…same for universal builds…" }
  }
}
```

#### Release workflow (the load-bearing steps)

Separate workflow on `macos-latest`, `workflow_call`/`workflow_dispatch` with a `version` input,
building via `tauri-apps/tauri-action@v0` (`args: --target universal-apple-darwin`, signing +
notarization env from secrets). Around the build, the two steps that make it robust:

```yaml
# BEFORE build — stamp the release version into every version file, so a manual
# dispatch or a missed version-bump PR can never ship a mislabeled app.
- name: Stamp version into desktop sources
  working-directory: apps/<slug>/desktop
  run: |
    VERSION="${{ inputs.version }}"
    node <<NODE
    const fs = require('node:fs')
    for (const path of ['package.json', 'src-tauri/tauri.conf.json']) {
      const json = JSON.parse(fs.readFileSync(path, 'utf8'))
      json.version = '$VERSION'
      fs.writeFileSync(path, JSON.stringify(json, null, 2) + '\n')
    }
    NODE
    sed -i '' "1,/^version = /s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
    perl -0pi -e "s/(name = \"<slug>-desktop\"\nversion = )\"[^\"]+\"/\$1\"$VERSION\"/" src-tauri/Cargo.lock

# AFTER build — refuse to publish a bundle that reports the wrong version.
- name: Assert built app version matches release version
  run: |
    APP="apps/<slug>/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/<App>.app"
    BUILT=$(defaults read "$PWD/$APP/Contents/Info" CFBundleShortVersionString)
    if [[ "$BUILT" != "${{ inputs.version }}" ]]; then
      echo "Built app reports $BUILT but the release is ${{ inputs.version }} — refusing to publish." >&2
      exit 1
    fi
```

Then generate `latest.json` from the `.sig` file + version + artifact URL and upload manifest +
tarball (+ DMG for the website download link) to the static host. If uploading to R2 with wrangler
v4, `r2 object put` needs `--remote` — without it the upload "succeeds" into a local simulation.

#### Version bumping (Release Please)

```jsonc
// release-please-config.json — paths are RELATIVE TO THE PACKAGE, not the repo root
"packages": {
  "apps/<slug>/desktop": {
    "release-type": "node",
    "extra-files": [
      { "type": "toml", "path": "src-tauri/Cargo.toml", "jsonpath": "$.package.version" },
      { "type": "json", "path": "src-tauri/tauri.conf.json", "jsonpath": "$.version" }
    ]
  }
}
```

Anything outside the package dir that displays the version (e.g. the marketing site) imports the
desktop `package.json` rather than hardcoding a string.
