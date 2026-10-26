# Supabase + supabase-auth (SSR, cookie-based)

Any auth flow that sends email (magic link, sign-up confirmation, reset) needs real SMTP before launch, since Supabase's built-in mailer only reaches the project team: point the project's SMTP settings at Resend (Maelstrom scripts it as `pnpm smtp <slug>`).

Only build this if the intake says auth/DB is required. Pattern: cookie-based
`@supabase/ssr`, no client SDK — auth mutations happen in Astro API routes that own
cookie writes. This reference is self-contained: all the code you need (core client
factories, middleware, auth routes) is embedded below.

Always read `.agents/skills/supabase-postgres-best-practices/SKILL.md` before writing
SQL/RLS.

## Env vars

`.env.example` (web) + `.dev.vars` (local, gitignored) + production Worker vars:

```
PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_SUPABASE_URL=
PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`src/env.d.ts` types both the vars and `App.Locals`:

```ts
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string
  readonly PUBLIC_SUPABASE_URL: string
  readonly PUBLIC_SUPABASE_ANON_KEY: string
  readonly SUPABASE_SERVICE_ROLE_KEY: string
}
interface ImportMeta { readonly env: ImportMetaEnv }

declare namespace App {
  interface Locals {
    user: import('@supabase/supabase-js').User | null
    supabase: import('@supabase/supabase-js').SupabaseClient | null
    profile: { username: string | null; display_name: string | null; is_admin: boolean } | null
  }
}
```

## core/ — Supabase clients

`core/src/runtimeEnv.ts` (Worker `process.env` first, then Vite `import.meta.env`):

```ts
type RuntimeEnv = Record<string, string | undefined>

export function getRuntimeEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & { process?: { env?: RuntimeEnv } }
  const processValue = runtime.process?.env?.[name]
  if (processValue !== undefined) return processValue
  return (import.meta as ImportMeta & { env?: RuntimeEnv }).env?.[name]
}
```

`core/src/supabase/cookies.ts` — bridge between raw `Cookie` header and Astro cookies:

```ts
import type { AstroCookies } from 'astro'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

function decodeCookieValue(value: string): string {
  try { return decodeURIComponent(value) } catch { return value }
}

export function getCookiePairs(headers: Headers): { name: string; value: string }[] {
  const header = headers.get('cookie')
  if (!header) return []
  return header.split(';').map((p) => p.trim()).filter(Boolean).map((part) => {
    const sep = part.indexOf('=')
    const name = sep === -1 ? part : part.slice(0, sep)
    const value = sep === -1 ? '' : part.slice(sep + 1)
    return { name, value: decodeCookieValue(value) }
  })
}

export function setCookiePairs(cookies: AstroCookies, toSet: CookieToSet[]): void {
  for (const { name, value, options } of toSet) cookies.set(name, value, options as never)
}
```

`core/src/supabase/server.ts`:

```ts
import type { AstroCookies } from 'astro'
import { createServerClient } from '@supabase/ssr'
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { getRuntimeEnv } from '../runtimeEnv'
import { getCookiePairs, setCookiePairs } from './cookies'

export function createSupabaseServerClient(
  cookies: AstroCookies,
  headers?: Headers,
): SupabaseClient | null {
  const url = getRuntimeEnv('PUBLIC_SUPABASE_URL')?.trim()
  const key = getRuntimeEnv('PUBLIC_SUPABASE_ANON_KEY')?.trim()
  if (!url || !key) return null

  return createServerClient(url, key, {
    cookies: {
      getAll() { return headers ? getCookiePairs(headers) : [] },
      setAll(toSet) { setCookiePairs(cookies, toSet) },
    },
    ...(headers ? { global: { headers: { cookie: headers.get('cookie') ?? '' } } } : {}),
  })
}

// service role — bypasses RLS; use only in trusted server code, never with user input as an auth boundary
export function createSupabaseServiceClient(): SupabaseClient | null {
  const url = getRuntimeEnv('PUBLIC_SUPABASE_URL')?.trim() ?? getRuntimeEnv('SUPABASE_URL')?.trim()
  const key = getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
```

`core/src/supabase/client.ts` (optional browser singleton — only if a component needs
realtime/client reads):

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRuntimeEnv } from '../runtimeEnv'

let browserClient: SupabaseClient | null = null

export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = getRuntimeEnv('PUBLIC_SUPABASE_URL')?.trim()
  const key = getRuntimeEnv('PUBLIC_SUPABASE_ANON_KEY')?.trim()
  if (!url || !key) return null
  if (!browserClient) browserClient = createBrowserClient(url, key)
  return browserClient
}
```

## web/src/middleware.ts — session per request

```ts
import { createSupabaseServerClient } from '@<scope>/<slug>-core'
import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServerClient(context.cookies, context.request.headers)
  context.locals.supabase = supabase
  context.locals.user = null
  context.locals.profile = null
  if (!supabase) return next()

  const { data: { user } } = await supabase.auth.getUser()
  context.locals.user = user

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name, is_admin')
      .eq('id', user.id)
      .maybeSingle()
    context.locals.profile = profile ?? null
  }
  return next()
})
```

## web/src/pages/api/auth/* — cookie-owning routes

All set `export const prerender = false`. Example `sign-in.ts`:

```ts
import type { APIRoute } from 'astro'

export const prerender = false

export const POST: APIRoute = async ({ request, locals }) => {
  const supabase = locals.supabase
  if (!supabase) return new Response(JSON.stringify({ message: 'Auth unavailable' }), { status: 500 })
  const { email, password } = (await request.json()) as { email?: string; password?: string }
  if (!email || !password)
    return new Response(JSON.stringify({ message: 'Email and password required' }), { status: 400 })

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return new Response(JSON.stringify({ message: error.message }), { status: 401 })
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}
```

`sign-up.ts` → `supabase.auth.signUp({ email, password })` (+ optional profile update).
`signout.ts` → `supabase.auth.signOut()` then `redirect('/')`.

`AuthForm.tsx` posts with `fetch` to these routes (no client Supabase SDK):

```tsx
const endpoint = mode === 'login' ? '/api/auth/sign-in' : '/api/auth/sign-up'
const res = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
if (!res.ok) throw new Error(((await res.json()) as { message?: string }).message ?? 'Auth failed')
window.location.href = '/'
```

## OAuth (Google) — server-initiated, same cookie boundary

Still no client Supabase SDK. The server starts the flow and a callback route exchanges
the code for a session (writing cookies through `locals.supabase`, exactly like the
email/password routes).

`web/src/pages/api/auth/oauth.ts` — start the flow, redirect the browser to Google:

```ts
import type { APIRoute } from 'astro'
export const prerender = false

export const GET: APIRoute = async ({ locals, url, redirect }) => {
  const supabase = locals.supabase
  if (!supabase) return new Response('Auth unavailable', { status: 500 })
  const siteUrl = import.meta.env.PUBLIC_SITE_URL ?? url.origin
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl}/api/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error || !data.url) return new Response(error?.message ?? 'OAuth start failed', { status: 500 })
  return redirect(data.url, 302) // Supabase → Google consent → back to /api/auth/callback?code=...
}
```

`web/src/pages/api/auth/callback.ts` — exchange the code, then land the user:

```ts
import type { APIRoute } from 'astro'
export const prerender = false

export const GET: APIRoute = async ({ locals, url, redirect }) => {
  const supabase = locals.supabase
  if (!supabase) return redirect('/login?error=auth_unavailable')
  const code = url.searchParams.get('code')
  if (!code) return redirect('/login?error=missing_code')
  const { error } = await supabase.auth.exchangeCodeForSession(code) // sets session cookies
  if (error) return redirect(`/login?error=${encodeURIComponent(error.message)}`)
  return redirect('/')
}
```

The Google button is a plain link/anchor to `GET /api/auth/oauth` (no JS needed):
`<a href="/api/auth/oauth">Continue with Google</a>`.

**Dashboard setup (the human must do this — not scriptable):**
1. Google Cloud → APIs & Services → Credentials → create an **OAuth 2.0 Client ID** (type:
   Web application). Authorized redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → **Google**: paste the Client ID + Secret, enable.
3. Supabase → Authentication → URL Configuration: add `${PUBLIC_SITE_URL}/api/auth/callback`
   (and the production URL) to **Redirect URLs**. Set Site URL to `PUBLIC_SITE_URL`.

No app env vars for Google — the client id/secret live in the Supabase dashboard, not the app.

**Cross-platform note (mobile):** native apps do NOT use this web redirect flow. Expo/React
Native gets a native Google ID token and calls `supabase.auth.signInWithIdToken({ provider:
'google', token })`. Essentials of the mobile hook:

```tsx
// mobile: useSignInWithGoogle — native token exchange, no browser redirect
import { GoogleSignin } from '@react-native-google-signin/google-signin'
// (lazy-require this module in real code: the native binary is absent in Expo Go)

GoogleSignin.configure({ webClientId, iosClientId }) // once, e.g. in a useEffect

async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices()
  const result = await GoogleSignin.signIn()
  // v16 API: { type: 'success', data: { idToken } } | { type: 'cancelled' }
  const idToken = result.type === 'success' ? result.data.idToken : null
  if (!idToken) return // cancelled
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
  if (error) throw error
}
```

The Supabase project + Google provider config is shared across web and mobile; only the
client handshake differs.

## Design & feature patterns (ported from the house mobile auth screens)

The house mobile auth screens are a deliberately distinct dark canvas, separate from the rest
of the app's normal light/dark theming. Port the *design* and the *feature shape* below to
web; the *mechanics* (native SDKs, deep links) don't transfer — use the redirect-based OAuth
flow above instead.

**Auth canvas — dark, unthemed, on purpose.** `/login` and `/register` use a fixed dark
background that never theme-swaps with the rest of a light/dark-mode app — mobile treats this as
the one canvas that should always look the same regardless of the user's theme. Add a `bg-auth`
Tailwind token mapped to a fixed dark value in `global.css` (its own CSS var, not `--background`),
and scope it to the auth pages only — never `/app`.

**Backdrop: a static gradient, not `backdrop-filter: blur`.** Mobile paints an off-center radial
"orb" behind the auth content — no blur, no animation. Web equivalent, plain CSS, no JS:

```css
.auth-backdrop {
  position: absolute;
  inset: 0;
  background: var(--auth-canvas);
  background-image: radial-gradient(
    72% 52% at 50% 30%,
    color-mix(in oklch, var(--accent) 55%, transparent),
    transparent 70%
  );
  pointer-events: none;
}
```

**Method button: one component, three tones, ordered by trust then reach.** Build a single
`AuthMethodButton` with a tone prop instead of styling each provider button separately:

```tsx
type Tone = 'solid' | 'outline' | 'muted'
function AuthMethodButton({ tone = 'muted', icon, label, loading, ...props }: AuthMethodButtonProps) { /* ... */ }
```

- `solid` (brand-filled) — the primary social provider (Google).
- `outline` — a secondary provider, if offered.
- `muted` (translucent fill) — email/password, always last; it's the fallback, not the default.

Full-width pill (`h-14 rounded-full`), icon + label centered with `gap-3`. Loading state
**replaces** the label with a spinner — never show a disabled label and a spinner side by side.

**Identifier-first email flow (optional upgrade over the plain login/signup toggle above).**
The mobile email screen asks for the email first, checks server-side whether an account exists
(an RPC via a trusted server route — never query `auth.users` from the client), then branches
the *same* screen into a login or signup form. Real UX improvement, but heavier to
build than the toggle-based `AuthForm` documented above — reach for it on a polished consumer
product, not an internal tool or an MVP. If the existence check fails or is unreachable,
**soft-fail to the login branch** and let the user switch manually; never block the auth flow on
a secondary check.

**Signup confirmation: a "sent" state, not a silent redirect.** After `supabase.auth.signUp`,
render a distinct confirmation state (icon + "check your email" copy + a muted spam hint) instead
of bouncing back to the login form. Add a resend action wired to `supabase.auth.resend({ type:
'signup', email })`, gated behind a client-side cooldown timer (mobile uses 30s) so a user can't
hammer the resend endpoint.

**Sign-out is a confirmation, not a bare click.** Wrap the call to `/api/auth/signout` behind a
confirm dialog ("Are you sure you want to sign out?") — mobile treats this as worth a pause even
though it's technically reversible.

**Account deletion, if offered, is always server-side.** Never delete a user or their rows from a
client-authenticated route. Shape: an API route authenticates the caller from their session, then
calls `supabase.auth.admin.deleteUser(user.id)` using the **service-role** client
(`createSupabaseServiceClient()`), never the cookie-bound one. Confirm via dialog first; sign the
user out client-side on success.

**What does not port: native SDKs and deep links.** Mobile's Google/Apple sign-in never touches
`signInWithOAuth`/`redirectTo` — it exchanges a native ID token via
`supabase.auth.signInWithIdToken({ provider, token })` (see the hook essentials above), zero
browser redirect involved. There is no web equivalent of that call shape for a plain browser app;
use the redirect-based flow documented above instead. Mobile also hand-parses Supabase's
password-reset deep link (rewriting a `#` fragment to `?`) — on web this is moot, since
`exchangeCodeForSession` on a normal URL query param handles it with no custom parsing.

## Protected routes

No global guard. Enforce per surface:

- **Login/register pages:** `if (Astro.locals.user) return Astro.redirect('/')`.
- **API mutations:** `if (!locals.supabase || !locals.user) return new Response(null, { status: 401 })`.
- **UI gating:** `const isLoggedIn = Boolean(Astro.locals.user)` in `.astro` pages; layout
  shows Sign out vs Log in/Sign up.

## Migrations, RLS, types

- Migrations in `web/supabase/migrations/*.sql`; local config in `web/supabase/config.toml`.
- **Profiles trigger:** auto-insert a `profiles` row on `auth.users` insert
  (`on_auth_user_created`).
- **RLS on every table.** Authenticated users scoped to their own rows; public data via
  `SECURITY DEFINER` RPCs rather than opening table policies. Never leave a table without
  RLS.
- Generate types into `core/src/types/database.types.ts` via `pnpm --filter <slug>-web
  db:types`. **Never hand-edit** that file — change migrations then regen.
- Applying migrations to the **remote** project (linking, per-project CLI credentials, the
  merge-to-`main` migrate job, and the verify-after-push runbook) is `deploy.md`. Note
  `db:types` reads `--linked` once a real project exists, and `--local` only before then.

Minimal `config.toml`. `project_id` here is the **local** identifier (Docker container naming) —
it does not point the CLI at a remote project, so it can't replace `supabase link`:

```toml
project_id = "<slug>"
[api]
enabled = true
port = 54321
[db]
port = 54322
major_version = 15
[studio]
enabled = true
port = 54323
```
