# Architecture: mobile (Expo + React Native)

Target: `apps/<slug>/mobile`. Everything needed to scaffold is embedded below — this
reference works even when no other app exists in the repo.

## Stack (fixed)

| Concern | Choice |
|---|---|
| Runtime | Expo SDK 57, React Native 0.86, React 19.2, new architecture on (check `npx create-expo-app` — the SDK moves) |
| Routing | Expo Router (file-based, typed routes), `src/app/` with `(public)`/`(protected)` groups |
| UI | **HeroUI Native** (`heroui-native` — compound components imported from the package, nothing copied into the repo) + **Uniwind** (Tailwind **v4**, CSS-first). Not NativeWind. |
| Data + Auth | **Supabase** (`@supabase/supabase-js`) + `@react-native-async-storage/async-storage` session, `react-native-url-polyfill` |
| Server state | TanStack Query |
| Validation | **zod** (env + every boundary) |
| Lint/format | **Biome** (self-contained config — see "Standalone" below) |
| Build / release | EAS Build + Submit; Expo Go for fast dev |

## Standalone package — the key difference from web/api

Mobile is **not** a root pnpm-workspace member. In the root `pnpm-workspace.yaml`, list
only the group's other sub-apps and leave mobile out with a comment:

```yaml
# apps/<slug>/* stays unglobbed on purpose — mobile is standalone with its own lockfile.
- 'apps/<slug>/web'
```

RN's native toolchain and its own lockfile don't play well with the hoisted monorepo store.

Consequences:

- `apps/<slug>/mobile` has its **own `pnpm-lock.yaml`** and its **own
  `pnpm-workspace.yaml`**, which is what makes the directory a pnpm workspace root of its
  own. Write that file first, before the first install.
- Run installs/scripts **from the mobile dir**, never repo root. No flags:

  ```bash
  pnpm install
  ```

  - **`pnpm-workspace.yaml` is the whole mechanism.** pnpm takes the nearest one above the
    CWD as its workspace root, so having one in the package stops every pnpm command
    walking up to the monorepo, including the ones you never type. Without it, an install
    resolves against the monorepo and writes the app's entire React Native tree into the
    **repo-root `pnpm-lock.yaml`** (thousands of lines) — and `eas build`, which runs a
    bare `pnpm install --frozen-lockfile` in the app directory and accepts no flags at
    all, installs the whole estate instead of this app and fails on the first web
    dependency that needs a compiler. A CLI flag cannot protect a command you do not type;
    a file in the directory can.
  - **`nodeLinker: hoisted` belongs in that same file.** Metro does not follow pnpm's
    symlinked store, so with the default layout a transitive package like `expo-router`
    cannot resolve `react-native` ("could not be found within the project or in these
    directories"). RN needs the flat, npm-shaped `node_modules`. pnpm 11 ignores
    `node-linker` from a nested `.npmrc`, which is why the setting lives here; keep the
    `.npmrc` as a fallback for older pnpm on a build machine.
  - **Pin `packageManager`** in the app's `package.json`: outside the workspace it no
    longer inherits the root's pnpm version, and a build machine will otherwise pick its
    own.
  - **`expo install` is then safe.** It shells out to a plain `pnpm add`, which used to
    re-pollute the root lockfile; with the workspace file in place that `pnpm add`
    resolves inside the package. `pnpm verify:docs` fails if a mobile package ever appears
    as an importer in the root lockfile, and fails if one of these files is missing.
- **iOS 26+ terminates an app that has not adopted the UIScene life cycle**, and
  as of SDK 57 the Expo template still generates the pre-scene `AppDelegate` and
  an `Info.plist` with no scene manifest. The app crashes on launch, before any
  JavaScript runs, with `EXC_BREAKPOINT` in
  `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. EAS builds
  with Xcode 26.6, so this reaches shipped builds, not just local ones.

  Expo ships the fix and does not wire it: `ExpoAppSceneDelegate` exists in the
  `expo` package. The app needs its `AppDelegate` to declare
  `ExpoReactNativeFactoryProvider` (the members it requires are already there),
  the window creation removed from `didFinishLaunchingWithOptions` because the
  scene delegate makes it, and `EXExpoAppSceneDelegate` named in the Info.plist.
  `ios/` is regenerated, so it belongs in a config plugin that **throws** when
  the template stops matching, so the day it is fixed upstream you find out from
  a failing prebuild rather than by carrying a dead plugin. Make every guard
  recognise the plugin's own output: `eas build` evaluates the config against
  whatever `ios/` already holds, so a guard that throws on *any* existing
  manifest fails every build after the first prebuild:

  ```js
  const { withAppDelegate, withInfoPlist } = require('expo/config-plugins')

  const withSceneAppDelegate = (config) =>
    withAppDelegate(config, (cfg) => {
      let c = cfg.modResults.contents
      // Guard each edit on its own condition. A single "already applied"
      // sentinel on the conformance is wrong, because upstream's eventual fix
      // *is* that conformance: the plugin would then return early forever and
      // the promised throw would never fire.
      if (c.includes('ExpoReactNativeFactoryProvider')) return cfg
      if (!c.includes('class AppDelegate: ExpoAppDelegate {')) {
        throw new Error('template changed: delete this plugin if it now adopts scenes')
      }
      c = c.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      )
      // The scene delegate makes the window; a second one here would be
      // detached, and the symptom is a blank screen with no error. So this
      // edit gets its own check rather than riding on the one above.
      if (!WINDOW_SETUP.test(c)) throw new Error('window setup not found: update the anchor')
      cfg.modResults.contents = c.replace(WINDOW_SETUP, '')
      return cfg
    })

  const withSceneManifest = (config) =>
    withInfoPlist(config, (cfg) => {
      cfg.modResults.UIApplicationSceneManifest = {
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: 'Default Configuration',
              UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
            },
          ],
        },
      }
      return cfg
    })
  ```

  Check it on any new app: `expo prebuild`, then look for
  `UIApplicationSceneManifest` in `ios/<name>/Info.plist`. If it is absent, the
  app does not launch.
- It is **not in the turbo graph** — CI runs its scripts directly from the dir (see `deploy.md` (CI)).
- Biome here is **self-contained** (a full `biome.json`, not `extends: "//"`) because the root
  config isn't resolvable outside the workspace:

  ```json
  {
    "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
    "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
    "files": {
      "ignoreUnknown": true,
      "includes": [
        "src/**/*.ts",
        "src/**/*.tsx",
        "app.config.js",
        "babel.config.js",
        "metro.config.js",
        "global.css",
        "config.js",
        "package.json",
        "tsconfig.json"
      ]
    },
    "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
    "linter": {
      "enabled": true,
      "rules": {
        "preset": "recommended",
        "complexity": { "noForEach": "off" },
        "style": { "noNonNullAssertion": "off" },
        "suspicious": { "noExplicitAny": "off" }
      }
    },
    "javascript": {
      "formatter": { "quoteStyle": "single", "trailingCommas": "all", "semicolons": "asNeeded" }
    },
    "assist": { "actions": { "source": { "organizeImports": "on" } } }
  }
  ```

- The pnpm **catalog** doesn't apply — pin RN/Expo versions via `expo install` instead.

## Scaffold with the native CLIs

Run **from `apps/<slug>/mobile`** after the Expo app exists. HeroUI Native has no component-copy
CLI step — components are imported from the `heroui-native` package, so there is no
`components/ui/**` folder to generate or maintain. (HeroUI's `create-heroui-native-app` scaffold
exists, but house apps start from `create expo-app` to keep the Expo Router layout and add HeroUI
manually.)

```bash
# 1. Expo baseline (file-based routing). --no-install so pnpm-workspace.yaml exists
#    before the first install; the SDK 57 template already lays code out under src/app
#    and ships a src/global.css, so do NOT delete a root-level app/ that isn't there —
#    check the template before removing anything.
pnpm create expo-app@latest apps/<slug>/mobile --template default --no-install
cd apps/<slug>/mobile
rm -rf src/components src/hooks src/constants src/app/*.tsx scripts   # demo screens
printf 'nodeLinker: hoisted\n' > pnpm-workspace.yaml   # BEFORE any install; see above
npm pkg set packageManager="$(node -p "require('../../../package.json').packageManager")"
pnpm install

# 2. Native/Expo modules. `expo install` picks SDK-aligned versions and, with
#    pnpm-workspace.yaml already in place, resolves inside this package.
pnpm exec expo install expo-constants expo-linking expo-web-browser \
  expo-font expo-splash-screen expo-system-ui expo-status-bar expo-image \
  react-native-safe-area-context react-native-screens react-native-gesture-handler \
  react-native-reanimated react-native-worklets react-native-svg
pnpm add zustand lucide-react-native zod
pnpm add -D @biomejs/biome babel-plugin-module-resolver vitest

# 3. HeroUI Native + Uniwind (Tailwind v4)
#    Mandatory peers (reanimated, gesture-handler, worklets, safe-area-context, svg) are
#    already SDK-aligned via `expo install` above — don't re-pin them.
pnpm add heroui-native uniwind tailwindcss tailwind-variants tailwind-merge
#    Optional: only if the app uses BottomSheet / Dialog / Menu / Popover / Select / Toast
pnpm add @gorhom/bottom-sheet
```

Then create `global.css` at the mobile package root (its location is the Tailwind class-scan
root, so keep it at the root — Uniwind scans from there):

```css
@import 'tailwindcss';
@import 'uniwind';
@import 'heroui-native/styles';
```

(`@source './node_modules/heroui-native/lib'` is only needed on `heroui-native` < 1.0.8 — newer
versions register their own source.) Theme tokens live in `global.css` — Tailwind v4 is CSS-first.
Do not add NativeWind (`withNativeWind`, `nativewind/babel`, `tailwind.config.js`,
`nativewind-env.d.ts`, `react-native-css-interop`).

## Theming — adapt HeroUI to the design

When a design exists (intake answers, `DESIGN.md`, brand tokens, screenshots, Figma), **theme
HeroUI Native to it before building screens**. Don't ship the stock palette, and don't color
individual components to compensate — all theming is semantic CSS variables in `global.css`,
overridden per color scheme:

```css
/* global.css */
@layer theme {
  @variant light {
    --accent: oklch(0.65 0.25 270);
    --accent-foreground: oklch(0.98 0.005 270);
    /* …background, surface, field, status variables as the design requires */
  }

  @variant dark {
    --accent: oklch(0.72 0.21 270);
    --accent-foreground: oklch(0.15 0.04 270);
  }
}
```

- Map the design's palette onto HeroUI's semantic variables: `--background`/`--foreground`,
  `--surface*` (cards, accordions), `--overlay` (dialogs, popovers), `--accent`, `--muted`,
  `--default`, `--field-*` (form inputs), status colors (`--success`/`--warning`/`--danger`),
  and `--border`/`--separator`/`--focus`/`--link`. For the complete variable list fetch
  `https://heroui.com/docs/native/getting-started/theming.mdx` or run `node scripts/get_theme.mjs`
  from the repo's `heroui-native` skill.
- Every variable overridden in one scheme must be overridden in both `light` and `dark`.
- **Only ship a dark scheme if the design actually defines one.** A design whose surfaces
  are literal brand colours (pastel cards, a fixed canvas) cannot be darkened by inverting
  the semantic tokens alone — the text flips while the surface under it does not, and
  headings vanish against their own card. The bug hides until someone flips the toggle.
  A real dark palette has to cover the brand surfaces, any inverse surfaces (black CTA
  pills whose text is already white, so they cannot simply invert) and the semantic tokens
  **together**. If the design only mocks dark mode with a canvas filter, mirror light into
  the dark variant and say so in a comment: a toggle that changes nothing beats one that
  half-inverts the UI, and filling the block in later stays a CSS-only change.
- Record the mapping (design token → CSS variable) in the surface's `DESIGN.md` so later work
  styles through the theme too.
- **Gold standard: reuse an existing HeroUI component and style it through the theme.** A visual
  mismatch with the design is a theme-variable fix (or a `tailwind-variants` variant), never a
  reason to hand-roll a replacement component or scatter one-off color classNames.

Then write these configs by hand (the CLIs don't produce them):

**`config.js` + `app.config.js`** — identity split: `config.js` holds
name/slug/scheme/bundle IDs/`easProjectId`; `app.config.js` reads it.

```js
// config.js
module.exports = {
  general: {
    appName: '<AppName>',
    owner: '<expo-owner>',
    slug: '<slug>',
    icon: './src/assets/images/icon.png',
    scheme: '<slug>',
    iosBundleIdentifier: 'com.<owner>.<slug>',
    androidPackageName: 'com.<owner>.<slug>',
    easProjectId: '<from eas init>',
  },
}
```

```js
// app.config.js
const config = require('./config.js')

module.exports = {
  expo: {
    owner: config.general.owner,
    name: config.general.appName,
    slug: config.general.slug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: config.general.icon,
    scheme: config.general.scheme,
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: { supportsTablet: false, bundleIdentifier: config.general.iosBundleIdentifier },
    android: {
      edgeToEdgeEnabled: true,
      // One file for every slot is the shortcut that costs you later: Android
      // masks the foreground and eats artwork drawn edge to edge, and the
      // App Store rejects a 1024 icon that has an alpha channel. Generate the
      // set from one SVG instead: references/icons.md.
      adaptiveIcon: { foregroundImage: config.general.icon, backgroundColor: '#0a0a0a' },
      package: config.general.androidPackageName,
      permissions: [],
    },
    plugins: [
      'expo-font',
      'expo-router',
      'expo-localization',
      'expo-web-browser',
      [
        'expo-splash-screen',
        { image: config.general.icon, backgroundColor: '#0a0a0a', imageWidth: 200 },
      ],
      ['expo-build-properties', { android: { minSdkVersion: 24 } }],
    ],
    experiments: { typedRoutes: true },
    extra: { router: { origin: false }, eas: { projectId: config.general.easProjectId } },
  },
}
```

**`metro.config.js`** — wrap with Uniwind's `withUniwindConfig` (`cssEntryFile: './global.css'`;
Uniwind auto-generates `uniwind-types.d.ts`, steer it into `src/` via `dtsFile` so tsconfig picks
it up without an explicit include). `withUniwindConfig` must be the outermost *wrapper*. Do not
replace Uniwind with NativeWind.

> **Never set `unstable_enablePackageExports = false` globally.** Older guidance turned it off
> for Supabase's deep exports and TanStack Query's `#private` fields, but RN 0.86 / SDK 57 resolve
> **their own** entry points through package exports — disabling it makes Metro unable to find
> `react-native` itself, and the error surfaces from an unrelated transitive module
> (`expo-router`, `expo-constants`) which sends you hunting in the wrong place. If a specific
> dependency still needs legacy resolution, scope it with a `resolveRequest` branch for that
> module only.

```js
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

const config = getDefaultConfig(__dirname)

const withUw = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './src/uniwind-types.d.ts',
  themes: ['light', 'dark'],
})

// Only if a dependency genuinely needs the legacy (non-exports) build — scope it to
// that module rather than turning package exports off for the whole bundle, which
// breaks react-native's own resolution on SDK 57.
const upstreamResolve = withUw.resolver.resolveRequest
withUw.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@tanstack/react-query' || moduleName === '@tanstack/query-core') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(
        require.resolve(`${moduleName}/package.json`),
        '../build/legacy/index.js',
      ),
    }
  }
  if (upstreamResolve) {
    return upstreamResolve(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = withUw
```

With no such dependency, the whole file is just `getDefaultConfig` wrapped in
`withUniwindConfig` — start there and add the resolver branch only when something fails.

**`babel.config.js`** — no `nativewind/babel`, no Uniwind preset (Uniwind needs none). Alias
`@` → `./src` (app code), `react-native-worklets/plugin` **last**:

```js
module.exports = (api) => {
  api.cache(true)
  return {
    // Let the SDK pick the preset version — `babel-preset-expo` is installed by the
    // template and must stay matched to it. Pinning it independently is how you get a
    // preset that emits syntax the SDK's Hermes cannot parse.
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
        },
      ],
      'react-native-worklets/plugin',
    ],
  }
}
```

**`tsconfig.json`** — `@/*` → `./src/*`. `src/uniwind-types.d.ts` (generated by Metro on first
run — start the dev server once to produce it; not `nativewind-env.d.ts`) is covered by the
`**/*.ts` include:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

**Root layout** — import `global.css`, wrap the app in `GestureHandlerRootView` (outermost,
`flex: 1`) then `HeroUINativeProvider`. Theme switching is `Uniwind.setTheme()` — do not call
`Appearance.setColorScheme()`.

```tsx
import { HeroUINativeProvider } from 'heroui-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import '../../global.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>{children}</HeroUINativeProvider>
    </GestureHandlerRootView>
  )
}
```

Keep **`babel-preset-expo` matched to the SDK** — it ships with the template, so never pin it
by hand; a mismatched preset emits syntax the SDK's Hermes cannot parse.

**Custom fonts: the weight must live in the family name, and nowhere else.** RN does not
synthesise weights, so a multi-weight family ships as one loaded face per weight
(`<Family>_700Bold`, …), each registered as its own family whose only member is
weight-normal. Pairing such a face with **any** `fontWeight` — a caller's style, a base
style, or a Tailwind `font-bold` class — makes iOS look for a bold member of that family,
fail, and silently fall back to the system font. The symptom is deceptive: bold text in
the wrong typeface next to correct-looking 400 text, which reads as a font that failed to
load and sends you auditing the loader instead of the styles.

Wrap it once and use the wrapper everywhere, including for library components that render
their own text (`Button.Label`, `TextArea`):

```tsx
export function face(weight: Weight = 400, size?: number): TextStyle {
  return { fontFamily: FACES[weight], fontWeight: 'normal', ...(size && { fontSize: size }) }
}
```

Set `--font-sans` to the **regular** face only, and never express weight with a utility
class. (Web is not affected — a variable font covers its whole weight range in one file.)

**`src/uniwind-types.d.ts` is generated by Metro on the first bundle**, not at install. Until it
exists, `tsc` reports `className` as missing on every RN component — that is the bootstrap, not a
config error. Run the dev server (or an export) once, then commit the file so CI can typecheck.

**Verify with a real bundle, not just `tsc`.** Metro resolution failures — the package-exports
trap above, a pnpm layout problem — typecheck perfectly clean and only fail when something
actually bundles. Make this the mobile build gate:

```bash
pnpm exec expo export --platform ios --output-dir /tmp/<slug>-export
```

Cross-reference the repo's `heroui-native` skill (install, component docs scripts, theming) for
usage rules.

## UI — reuse first

`heroui-native` is the only primitive library. Product UI is composed from it, not reimplemented
next to it — visual deviations from the design are fixed in the theme (see "Theming" above), not
per screen.

1. **Need a primitive?** Import it from `heroui-native` (Button, Card, TextField, Dialog, …).
   Use semantic variants (`primary`/`secondary`/`tertiary`/`danger`/`ghost`/`outline`) and
   `size` first, then Uniwind `className` with semantic theme tokens — never raw colors. Do not
   wrap RN `View`/`Text`/`TouchableOpacity`/`TextInput`/`ScrollView`/`Image` into house
   primitives (`MyButton`, `AppText`).
2. **Compound components are the API.** Subcomponents come via dot notation and are required —
   e.g. `Card.Header` / `Card.Body` / `Card.Footer`, with `Card.Title` + `Card.Description`
   inside `Card.Body`. Don't flatten compound structure into props.
3. **Repeated composition?** Prefer a `className` / `tailwind-variants` (`tv`) variant on the
   existing component. A product wrapper in `src/components/<domain>/` is allowed only when the
   same composition is used on multiple screens **and** it is built from `heroui-native` parts.
4. **Verify the API before using a component** — fetch the MDX docs
   (`https://heroui.com/docs/native/components/<kebab-name>.mdx`) or use the `heroui-native`
   skill's `scripts/get_component_docs.mjs`. Native ≠ HeroUI React (web): package is
   `heroui-native`, events are `onPress`, colors are HSL.

## Conventions

- **zod-validated env** in `src/lib/env.ts` — the only module reading `process.env`.
  `EXPO_PUBLIC_*` is inlined into the client bundle and public; anything else is a secret and
  must never be `EXPO_PUBLIC_`.
- **Supabase client** (`src/lib/supabase.ts`): `createClient(url, publishableKey, { auth: {
  storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }})`
  with `import 'react-native-url-polyfill/auto'`. Foreground-only auto-refresh via `AppState`.
- **Auth routing**: centralize the guard in a `SessionProvider` — `(public)` for signed-out,
  `(protected)/(tabs)` for signed-in. No per-screen ad-hoc guards. See `supabase-auth.md`.
- **Styling**: Uniwind `className` for product UI; plain RN `style` only for shadows, pressed
  opacity, dynamic values. Tokens live in `global.css`. Never add `tailwind.config.js`.
- **DB types**: `supabase gen types typescript --local > src/lib/db/types/generated.ts`
  (`pnpm supabase:types`). Never hand-edit. RLS on every table.
- Ships via EAS / the app stores — no Cloudflare Worker, no `wrangler.jsonc`.

If a shared `core/` exists (web+mobile), import the Supabase types from it; the RN client itself
usually stays in `mobile/` because of the AsyncStorage/native specifics.
