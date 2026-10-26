# Architecture: web (Astro + React on Cloudflare Workers)

This reference is self-contained: every monorepo-specific config shape it depends on is embedded
below — it works in a repo where no other app exists yet.

Target: `apps/<slug>/web`.

## Stack (fixed)

| Concern | Choice |
|---|---|
| Framework | Astro 7 + `@astrojs/react` (React 19) |
| Rendering | `output: 'server'` (SSR) when there's auth/DB; `'static'` for pure marketing |
| Styling | **Tailwind v4** via `@tailwindcss/vite` (CSS-first, `@theme inline`, **no** config file) |
| UI | **coss UI** on Base UI via the shadcn CLI registry (`@coss`), `cva` + `clsx` + `tailwind-merge` + `tw-animate-css`, `lucide-react` |
| UI patterns | **coss particles** — copy-paste compositions from the same registry (`@coss/p-<name>`) |
| Validation | **zod** for everything: env, forms, search params, request/response bodies, webhooks (`conventions.md`) |
| DB + Auth | **Supabase** (`@supabase/ssr` cookie SSR) + Postgres migrations + RLS |
| Payments | **Polar** (merchant of record) or **Stripe** — Checkout + signed webhook, chosen at intake |
| Email | **Resend** — transactional/product email, when needed |
| Deploy | **Cloudflare Workers** via `@astrojs/cloudflare` + `wrangler.jsonc` |
| Analytics | the repo's cookieless tracker as an Astro integration (`seo-legal-analytics.md`) |
| Lint/format | Biome (`extends: "//"`) |

Use the pnpm **catalog** for `astro`, `react`, `react-dom`, `tailwindcss`, `@tailwindcss/vite`,
`@astrojs/react`, `@astrojs/cloudflare`, `@cloudflare/workers-types`, `@types/react*`, `wrangler`,
`typescript`. Non-catalog: `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`,
`lucide-react`, `@base-ui/react`, `@astrojs/sitemap`; `@supabase/ssr` + `@supabase/supabase-js` (auth);
`@polar-sh/sdk` or `stripe` (payments — one, not both); `resend` (email); `zod`.

## Scaffold with the native CLIs

```bash
# 1. Astro baseline
pnpm create astro@latest apps/<slug>/web -- --template minimal --typescript strict --no-install --no-git
cd apps/<slug>/web
pnpm astro add react cloudflare        # @astrojs/react + @astrojs/cloudflare adapter
pnpm add -D @tailwindcss/vite && # then add `tailwindcss()` to the Vite plugins in astro.config

# 2. coss UI (default React/Astro kit — not shadcn/Radix, not reui)
#    Follow https://coss.com/ui/docs/get-started — it is the source of truth, and
#    the manual path skips tokens the CLI installs for you. Same rule for any
#    framework: read its own setup guide before improvising one.
#    FIRST add `paths: { "@/*": ["src/*"] }` to tsconfig.json. The shadcn CLI resolves
#    its aliases through tsconfig; without them it creates a literal `@/` DIRECTORY at
#    the app root and writes every component there. A stray `@/` folder means the
#    mapping is missing — add it, move the files under src/, delete the folder.
pnpm dlx shadcn@latest init @coss/style
# @coss/style may write a Next.js layout.tsx / app/ tree. Delete those; this is Astro.
# It also installs its own font packages (Inter, Geist) and @imports them into
# global.css. If the app uses different fonts, remove BOTH the imports and the deps —
# `@import "geist"` has no root CSS export and fails the build outright.
# Then add only the primitives the core feature needs:
pnpm dlx shadcn@latest add @coss/button @coss/card @coss/input @coss/label
# `add @coss/style` pulls the whole registry. Prune what the app doesn't use, then
# grep the survivors for cross-imports to be sure nothing dangles.
# If UI components live in a shared package (packages/<x>), Tailwind does not scan
# it by default. Add `@source "<relative path to that package's src>"` to the app's
# global.css and VERIFY THE PATH RESOLVES — a wrong one fails silently, and stays
# invisible while the app happens to use the same utilities itself. Confirm after a
# build by grepping the emitted CSS for a class only the package uses.
# Composed patterns: read .agents/skills/coss-particles/SKILL.md, then
# pnpm dlx shadcn@latest add @coss/p-<name>
```

Then reconcile configs to the shapes below (the CLIs won't produce the monorepo specifics):

- **`astro.config.mjs`** — `output: 'server'` + `cloudflare()` adapter + `react()` + `sitemap()`;
  Vite `plugins: [tailwindcss()]`; `@` → `src` alias; for SSR-with-core add the `@<scope>/<slug>-core`
  alias + `ssr.noExternal: ['@<scope>/<slug>-core', '@base-ui/react']`. SSR shape:

  ```js
  import path from 'node:path'
  import { fileURLToPath } from 'node:url'
  import cloudflare from '@astrojs/cloudflare'
  import react from '@astrojs/react'
  import sitemap from '@astrojs/sitemap'
  import tailwindcss from '@tailwindcss/vite'
  import { defineConfig } from 'astro/config'

  const root = path.dirname(fileURLToPath(import.meta.url))

  export default defineConfig({
    site: process.env.PUBLIC_SITE_URL || 'https://<domain>',
    output: 'server',
    integrations: [react(), sitemap()],
    adapter: cloudflare(),
    vite: {
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          '@': path.join(root, 'src'),
          '@<scope>/<slug>-core': path.join(root, '../core/src'),
        },
      },
      ssr: {
        noExternal: ['@<scope>/<slug>-core', '@base-ui/react'],
      },
    },
  })
  ```

  Static (pure marketing) variant: `output: 'static'`, drop the core alias and keep
  `ssr.noExternal: ['@base-ui/react']`, and disable Astro sessions so deploys don't auto-provision a
  SESSION KV namespace — `import { defineConfig, sessionDrivers } from 'astro/config'` and set
  `session: { driver: sessionDrivers.null() }`.
- **`wrangler.jsonc`** — `main: "@astrojs/cloudflare/entrypoints/server"`, `assets` binding to `./dist`,
  `nodejs_compat`, `observability.enabled`. Secrets via `.dev.vars` (gitignored) + `wrangler secret put`.
  Plus the two things that are easy to forget and fail silently — `routes` with
  `custom_domain: true` for apex + `www` (with none, it deploys to `workers.dev` and the domain
  never resolves), and `vars` for public config like `PUBLIC_SITE_URL` / `PUBLIC_API_URL`.
  `PUBLIC_SITE_URL` also feeds `site` at **build** time, so it must be set in the deploy workflow's
  build step too or canonicals and the sitemap take the fallback. Details: `deploy.md`.
- **`public/.assetsignore`** — must contain `_worker.js` and `_routes.json` (Workers SSR).
- **`compatibility_date` must not exceed the installed workerd.** The adapter boots a local
  workerd to prerender, and a date newer than the binary supports fails the build with
  "requires compatibility date … but the newest date supported by this server binary is …".
  Copy the date from a sibling app rather than reaching for today's.
- **Base UI islands must own their subtree.** coss primitives are compound components that pass
  state through React context, and that context does not survive Astro template children
  crossing the island boundary — `<Accordion client:visible>{items.map(...)}</Accordion>` in a
  `.astro` file fails to prerender with an opaque Base UI error code. Put the whole composition
  in one `.tsx` component that takes plain data as props, and hydrate that.
- **`components.json`** — `rsc: false`, `tsx: true`, `baseColor: neutral`, `iconLibrary: lucide`,
  aliases `@/*`, and the coss registry (not `@reui`):

  ```json
  {
    "$schema": "https://ui.shadcn.com/schema.json",
    "style": "new-york",
    "rsc": false,
    "tsx": true,
    "tailwind": {
      "config": "",
      "css": "src/styles/global.css",
      "baseColor": "neutral",
      "cssVariables": true,
      "prefix": ""
    },
    "aliases": {
      "components": "@/components",
      "utils": "@/lib/utils",
      "ui": "@/components/ui",
      "lib": "@/lib",
      "hooks": "@/hooks"
    },
    "iconLibrary": "lucide",
    "registries": {
      "@coss": "https://coss.com/ui/r/{name}.json"
    }
  }
  ```

  `init @coss/style` writes this; if you hand-write `components.json` first, still run
  `pnpm dlx shadcn@latest init @coss/style` (or `add @coss/style`) so tokens and fonts land.
- **`src/styles/global.css`** — `@import "tailwindcss"; @import "tw-animate-css";` + `@theme inline`
  mapping coss semantic tokens to oklch CSS vars (per `DESIGN.md`). Generate values via
  `@coss/style`, then tune. Do not replace `--alpha()` with `color-mix()` — coss tokens use it.
- **After primitives exist**, read `.agents/skills/coss/SKILL.md` then
  `.agents/skills/coss-particles/SKILL.md` before composing screens. Do not add Sonner, cmdk,
  input-otp, radix-ui, or reui for tasks coss already covers (toast, command, otp-field, dialog).
- **`src/lib/utils.ts`** — the standard `cn = twMerge(clsx(inputs))`.
- **`biome.json`** — `extends: "//"` + `files.includes` for `src`, `astro.config.mjs`, `components.json`.
- **`tsconfig.json`** — extends `astro/tsconfigs/strict` (or the app's `tsconfig.base.json`),
  `@/*` → `src/*`, `jsx: react-jsx`.

## Landing + auth-gated app: one surface, not two

**General rule: when a web app has auth, the marketing landing page and the app live in the
same Astro project — never scaffold a separate marketing site plus a separate app/dashboard
subdomain.** One deploy, one Worker, one `Astro.locals.user` check. Two shapes cover almost
every product, pick per intake:

1. **Landing gates into an app route** (the common SaaS/tool shape): `index.astro` is public
   marketing copy; it reads `Astro.locals.user` once and swaps the primary CTA (`Sign in` →
   `Open app`, `Get started` → the logged-in label) so the same page serves logged-out visitors
   and returning users without a redirect. The actual app lives at `/app` (or `/dashboard`),
   gated with `if (!user) return Astro.redirect('/login')`.
2. **The page *is* the product, auth is optional/per-action**: there's no separate marketing
   page — `index.astro` renders the product immediately (e.g. today's content, a public feed),
   and only specific actions (voting, commenting) require `Astro.locals.user`. Auth pages
   (`/login`, `/register`) still exist, but nothing sits in front of the product as a gate.

Don't invent a third shape (separate splash/onboarding site, marketing on one Worker + app on
another) unless the intake gives a concrete reason — extra deploys, extra DNS, and a second
place for `Astro.locals.user` logic to drift out of sync are the actual cost of splitting them.

## Landing sections

The marketing page follows the design skill's `references/landing-anatomy.md`: one component per
section, content passed in as props, each section carrying that file's id. Prices on the page are
the prices checkout charges. A section the anatomy marks honesty-gated is omitted when the proof
does not exist, and the PR says so. The taste run decides how each section looks.

## Feature modules (add per intake)

- **Supabase + auth** — cookie-based `@supabase/ssr`, middleware populates `Astro.locals.user`, auth
  mutations via `/api/auth/*` routes (no client SDK), migrations in `web/supabase/migrations`, RLS on
  every table, types generated into `core/src/types/database.types.ts`. Full pattern + design/UX
  guidance: `supabase-auth.md`.
- **Stripe prices are declared, never clicked.** Write `apps/<slug>/stripe.config.json` with the
  plans, and a repo script creates products, prices and portal from it through the Stripe API in
  test mode (Maelstrom: `pnpm stripe <slug> --write`). Each price id is an env var: declared in
  `.env.example`, empty in `wrangler.jsonc` `vars` until the live run fills it. Going live is then
  the same script against the live key, one prices PR, and the secrets set on the Worker. Minimal
  file:

  ```json
  {
    "prices": [{ "env": "STRIPE_PRICE_PRO", "lookupKey": "<slug>_pro_monthly", "name": "<App> Pro", "amount": 900, "interval": "month" }],
    "surfaces": { "web": ["STRIPE_PRICE_PRO"] },
    "portal": { "headline": "<App>: your plan" },
    "webhook": { "url": "https://<domain>/api/stripe/webhook", "surface": "web",
                 "events": ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted"] }
  }
  ```

- **Stripe sells as merchant of record by default.** New Stripe products use Managed Payments
  ([Managed Payments](https://docs.stripe.com/payments/managed-payments)): pass `managed_payments: { enabled: true }` on the
  Checkout Session and do not pass `automatic_tax`, `tax_id_collection`, `invoice_creation`,
  `custom_text` or payment-method params: Stripe taxes the sale and emails the buyer's invoice
  itself, and the legal pages must say so.
- **Stripe** — Checkout Session create route + a webhook route using **raw body** +
  `stripe.webhooks.constructEventAsync` (the async variant — the sync one uses Node crypto that
  isn't on Workers) + a service-role Supabase write. Validate the parsed event with zod. Webhook
  essentials (`src/pages/api/stripe/webhook.ts`):

  ```ts
  import type { APIRoute } from 'astro'
  import Stripe from 'stripe'
  export const prerender = false

  export const POST: APIRoute = async ({ request }) => {
    const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY)
    const sig = request.headers.get('stripe-signature') ?? ''
    const body = await request.text() // raw body — never parse before signature verification

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(
        body, sig, import.meta.env.STRIPE_WEBHOOK_SECRET,
      )
    } catch (err) {
      return new Response(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown'}`, {
        status: 400,
      })
    }

    if (event.type === 'checkout.session.completed') {
      // zod-parse the fields you use, then write via createSupabaseServiceClient()
    }
    return new Response(null, { status: 200 })
  }
  ```
- **Polar** — the merchant-of-record alternative to Stripe; pick between them at intake, not after
  wiring one (`intake.md`). Same shape as above — checkout-create route + signed webhook + a
  service-role write — with four differences worth knowing before you choose:

  ```ts
  import { Polar } from '@polar-sh/sdk'
  import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks'

  const polar = new Polar({ accessToken, server: isSandbox ? 'sandbox' : 'production' })
  const checkout = await polar.checkouts.create({
    products: [productId],                 // product ids, not price ids
    customerEmail: user.email,
    externalCustomerId: user.id,           // echoed back as customer.externalId
    customerIpAddress: request.headers.get('cf-connecting-ip') ?? clientAddress,
    successUrl: `${siteUrl}/app/settings?upgraded=1`,
  })

  // Verified with pure-JS sha256 (Standard Webhooks) — no Node crypto, so this
  // is synchronous on Workers, unlike Stripe's constructEventAsync.
  const event = validateEvent(body, Object.fromEntries(request.headers), webhookSecret)
  ```

  1. **Forward the client IP.** As merchant of record Polar infers the buyer's tax country from the
     caller's IP; from a Worker that is *your* IP, so every customer gets taxed wherever the edge
     answered. `customerIpAddress` is not optional in this deployment shape.
  2. **Cloudflare Bot Fight Mode blocks provider webhooks** with a 403. On a Cloudflare-proxied zone
     that failure is invisible until subscriptions silently stop applying.
  3. **`externalCustomerId` is the join key** — set it to your user id and the webhook needs no
     mapping table.
  4. **Check `npm view <pkg> dist-tags` before following provider docs.** Vendor quickstarts
     sometimes document an unreleased major (`@next`); pin the stable line for anything touching
     money.
- **Entitlement events, whichever provider.** Key the upgrade off the *recurring* subscription-active
  event rather than the one-shot checkout-completed one: it fires again on every renewal, so a lost
  delivery self-heals instead of stranding a paying account. And downgrade on the event that
  actually ends access (Polar `subscription.revoked`, Stripe `customer.subscription.deleted`), never
  on "canceled" — cancellation only schedules an end date, and a customer who cancels keeps what
  they paid for until the period closes.
- **Resend** — a thin `src/lib/email.ts` wrapping the Resend client; send from server routes only
  (API key is a Worker secret, never `PUBLIC_`). Validate inputs with zod.
- **SEO / legal / analytics** — `Layout.astro` `<head>` (canonical, OG, JSON-LD), sitemap + robots,
  `imprint.astro` + `privacy.astro` (noindex + hosted legal images), the analytics integration. See
  `seo-legal-analytics.md`.

## Two rules the checkout taught us

**State-changing actions are POST.** Sign-out, delete, cancel: a link (`GET`) to an endpoint that
only implements `POST` renders the 404 page and leaves the session intact, and a `GET` that does
change state can be fired by a prefetcher, a link scanner or an `<img src>` on the user's behalf.
Forms cannot nest, so when the action sits inside another form, render the tiny form as a sibling
and bind the button with the `form` attribute:

```tsx
<form id="sign-out" method="post" action="/api/auth/signout" />
<form onSubmit={save}>
  …
  <button type="submit" form="sign-out">Abmelden</button>
</form>
```

**Money paths fail closed.** Three failures worth designing against before the first sale:

- **Availability is counted the way the database enforces it.** If a trigger counts every row and
  the page counts only the published ones, the page sells something the database then refuses, and
  the buyer has already paid. Expose the count through the same source as the constraint.
- **Cancelling after payment is not a refund.** A subscription checkout completes only after the
  first invoice is paid, so a race the loser pays for needs an explicit `refund: 'manual'` marker in
  the webhook response and a log line, or nobody learns about it.
- **The first failed invoice is not a cancellation.** Stripe sends `invoice.payment_failed` on
  attempt one, days before the retry schedule ends. Releasing the entitlement there costs a paying
  customer their spot over an expired card; release it when the subscription actually lapses.

## zod

One `src/lib/env.ts` (or `core/`), the only module reading `import.meta.env` / `process.env`, parsed
with zod — `PUBLIC_*` client-safe vs unprefixed Worker secrets validated as separate schemas. Request
bodies, webhook payloads, search params and form input are parsed with the schemas in
`src/lib/schemas.ts` (or `core/` when another surface shares them); a React form validates with the
same schema the route parses, narrowed by `.pick()`. No `as` casts on input. Full rule:
`conventions.md`, Validation.
