# Intake interview

Run this before building. Goal: aim the MVP at revenue in ~6–9 questions. The user
supplies the business idea; you ask the open questions. **Every question has a
recommended default** — lead with it, give a one-line reason, and if the user
shrugs, take the recommendation and move on.

Ask via the `AskQuestion` tool (multiple choice, `allow_multiple` where noted). Put
the recommended option **first** and append "(Recommended)". Batch related questions
into one form. Don't ask anything the fixed stack already answers.

Lead with the high-signal questions: platform/surfaces, who pays, what they pay for,
pricing, and the single core action. Stop at about 6 to 9.

Minimum to pin down before building: **platform(s)**, **app name/slug**, **domain**,
**paid vs free + pricing**, **the one core action**, **auth required?**, **data model
sketch**, **legal entity** (default: reuse the hosted `<legal-assets-host>/legal/*` images).

## 1. Monetization & audience (highest signal — ask first)

- **Who is the paying customer?** (one sentence — a role/segment, not "everyone").
  - Recommend: narrow to a single reachable niche. A vague ICP kills MVPs.
- **Is demand validated?**
  - Recommend: **Not yet → ship a waitlist/pre-sale landing as the MVP.** Validate
    before building product. (repo revenue-first principle)
- **Pricing model?**
  - Options: One-time / Monthly subscription / Usage-based / Freemium+paid tier / Free
    (waitlist only).
  - Recommend: **Monthly subscription** for tools, **one-time** for a utility. State a
    concrete starting price (e.g. "$19/mo" or "$49 one-time") — don't leave it open.
- **Free tier / trial?**
  - Recommend: **7-day trial, no card** if subscription; **no free tier** if one-time.
- **Payment provider?** (only if paid)
  - Recommend: **Polar** for anything selling internationally from an EU entity. It is a
    **merchant of record** — it becomes the seller and owns EU VAT, UK/AU GST and US sales
    tax, so there is no OSS registration, no quarterly filings, no audit exposure. The fee
    premium over Stripe (roughly 1–2 points) buys that, and at pre-revenue volume the
    filing hours cost more than the spread.
  - Choose **Stripe** when you need control it doesn't trade away: per-seat billing,
    entitlements, custom dunning/trials, or an existing Stripe-based back office.
  - Either works for a one-time-purchase desktop/download product — buyer gets a license
    key at checkout, the app validates it against the provider API and stores it in the OS
    keychain.
  - Decide **before** wiring one up. The swap is small (~150 lines and one column rename)
    but it is a migration on a live billing table once customers exist.

## 2. Product core

- **The one core action** a user must complete for the product to be worth paying for
  (one verb phrase). Everything else is deferred.
  - Recommend: pick the single action; cut the rest to a v2 list.
- **Does the MVP need accounts/auth?**
  - Recommend: **Only if the core action produces per-user data.** A marketing/waitlist
    MVP needs no auth (skip Supabase auth, keep it static).
- **Data model sketch** — the 2–4 tables behind the core action.
  - Recommend: propose the tables from the idea (e.g. `profiles`, `<entity>`,
    `<entity>_events`) and confirm.
- **Any external integration** required for the core action? (Stripe, an LLM, an email
  provider, a 3rd-party API)
  - Recommend: defer everything not on the critical path.
- **Platform / surfaces** (`allow_multiple`, **highest architectural signal** — this picks the
  architecture reference to follow): **Web** (Astro) / **Mobile** (Expo + React Native) /
  **Desktop** (Tauri) / **Standalone server + MCP** (Nitro API).
  - Recommend: **Web only** for most MVPs (fastest to a paying customer). Choose **Mobile** when
    the product is inherently a phone app (on-the-go, camera, push, offline); **Desktop** when it
    needs OS-level integration (menu bar, wallpaper, local files, always-on). Add a **Nitro `api/`**
    only when a non-web consumer exists (agents/MCP, mobile, webhooks, cron). When ≥2 surfaces exist,
    add a shared `core/` package. Each chosen surface → its `surface reference` reference.
    (See SKILL.md Phase 0.)

## 3. Positioning & content

- **App name + slug + domain.**
  - Recommend: propose a slug (`apps/<slug>`) and a `.com`; confirm the domain is
    available/owned.
- **One-line value proposition** (used for `<title>`, OG, hero).
  - Recommend: draft it from the idea; refine with the user.
- **Visual direction** (for `DESIGN.md`).
  - Options: Clean neutral (default) / Warm cream (directory) / Bold dark / Match an
    existing brand.
  - Recommend: **Clean neutral oklch** — fastest to a credible look with coss UI.

## 4. Compliance & ops (quick confirmations)

- **Legal entity for imprint/privacy?**
  - Recommend: **Reuse the hosted legal images** (`<legal-assets-host>/legal/*`) —
    zero legal-copy work for the MVP.
- **Analytics/consent posture?**
  - Recommend: **the repo's cookieless tracker** (Maelstrom: agentsgym; elsewhere a cookieless
    product-analytics setup), no consent banner for the MVP.
- **Custom transactional email now?**
  - Recommend: **No — rely on Supabase's built-in auth emails.** Add Resend later if the
    product needs product emails.

## Output

Write the confirmed answers as the build brief, in git, where the repo's `AGENTS.md` keeps
product briefs (Maelstrom: `docs/office-hours/<slug>/README.md`). Structure:

```markdown
# <App> — MVP brief

- Slug / domain:
- Paying customer:
- Demand validated: yes/no  → MVP shape: waitlist | full build
- Pricing: <model + price>  · trial: <...>  · provider: <Stripe|Polar|none>
- Core action:
- Surfaces: web | web+api(nitro) | web+api+mobile(expo) | ...  → shared core/: yes/no
- Auth required: yes/no
- Data model: <tables>
- Value prop:
- Visual direction:
- Legal: hosted images | custom
- Analytics: <tracker>, cookieless
- Deferred to v2: <list>
```

Then start Phase 2 (the build checklist in SKILL.md).
