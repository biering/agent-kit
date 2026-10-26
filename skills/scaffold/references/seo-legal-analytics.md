# SEO, legal (imprint/privacy), and analytics

Self-contained: the templates below are complete — no other app needs to exist in the repo.
Files you create: `src/layouts/Layout.astro`, `src/pages/imprint.astro`, `src/pages/privacy.astro`,
`public/robots.txt`, plus a `.legal-content` block in `global.css`. Tracking is an Astro
integration, not a layout component.

## Site metadata (`src/consts.ts` or `src/site.config.ts`)

Centralize the strings the head/OG/JSON-LD read:

```ts
export const SITE_NAME = '<App>'
export const SITE_TAGLINE = '<one-line value prop>'
export const SITE_DESCRIPTION = '<~155-char meta description>'
export const SITE_URL = import.meta.env.PUBLIC_SITE_URL ?? 'https://<domain>'
// pricing/product constants as needed for JSON-LD offers
```

**Shared identity + legal values come from the repo's brand package (`@<scope>/brand`)** (`"@<scope>/brand": "workspace:*"`)
— import author, X handle (`X_HANDLE_AT`, `X_URL`), `GITHUB_URL`, `COMPANY`, and the hosted legal
image URLs (`LEGAL_IMPRINT_IMG` / `LEGAL_PRIVACY_IMG`) rather than re-hardcoding, so a handle/author
change propagates. Keep only **app-specific** values (name, tagline, description, domain, price) in the
app's own consts. Astro apps must add the repo's brand package (`@<scope>/brand`) to `ssr.noExternal`. (Mobile is standalone
and doesn't consume it.)

## Layout `<head>` template

`Layout.astro` accepts `title?`, `description?`, `indexable?` (default `true`). Set `site:` in
`astro.config.mjs` so `Astro.site` resolves canonical/OG absolute URLs. Ship a 1200×630 PNG at
`public/og.png`. Pick the JSON-LD schema.org type that fits (`SoftwareApplication`, `Product`,
`WebSite`, `Organization`); include `offers` with price/currency when paid.

```astro
---
import "../styles/global.css"
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "../consts"
import { X_HANDLE_AT } from "@<scope>/brand"

interface Props {
  title?: string
  description?: string
  indexable?: boolean
}

const {
  title = `${SITE_NAME} · ${SITE_TAGLINE}`,
  description = SITE_DESCRIPTION,
  indexable = true,
} = Astro.props

const canonical = new URL(Astro.url.pathname, Astro.site)
const ogImage = new URL("/og.png", Astro.site)

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication", // or Product / WebSite / Organization
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: String(canonical),
  image: String(ogImage),
  // offers: { "@type": "Offer", price: PRICE_AMOUNT, priceCurrency: PRICE_CURRENCY }, // paid only
}
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content={description} />
    {!indexable ? <meta name="robots" content="noindex, nofollow" /> : null}
    <meta name="theme-color" content="#161616" />
    <link rel="canonical" href={canonical} />
    <link rel="icon" type="image/svg+xml" href={`${import.meta.env.BASE_URL}favicon.svg`} />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />

    <meta property="og:type" content="website" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:image" content={ogImage} />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={`${SITE_NAME} — ${SITE_TAGLINE}`} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImage} />
    {X_HANDLE_AT ? <meta name="twitter:site" content={X_HANDLE_AT} /> : null}
    {X_HANDLE_AT ? <meta name="twitter:creator" content={X_HANDLE_AT} /> : null}

    <title>{title}</title>
    <script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
  </head>
  <body class="flex min-h-full flex-col">
    <slot />
  </body>
</html>
```

## Sitemap + robots

**Default to the `@astrojs/sitemap` integration** — Astro's recommended way.
It generates `sitemap-index.xml` + `sitemap-0.xml` at **build time** (static files, no runtime route),
auto-includes every page, and filters what you don't want. It needs `site:` set in `astro.config.mjs`.

```js
import sitemap from '@astrojs/sitemap'
// integrations: [
//   react(),
//   sitemap({ filter: (page) => !/\/(imprint|privacy|404)\/?$/.test(page) }),
// ]
```

Exclude noindex/utility routes via `filter`; add `lastmod`/`changefreq`/`priority` via `serialize`
only with a reason. Point robots at `sitemap-index.xml`.

**Manual alt** (`src/pages/sitemap.xml.ts`, `prerender = false`, lists only indexable URLs):
reach for it ONLY when you need dynamic/DB-driven URLs the integration can't see.
On an `output: 'static'` site it forces a dynamic Worker route just for the sitemap, so it is not the
default. If you use it, point robots at `sitemap.xml` (not `-index`).

`public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /imprint
Disallow: /privacy

Sitemap: https://<domain>/sitemap-index.xml
```

`public/.assetsignore` (Cloudflare): `_worker.js` and `_routes.json` (see web.md).

## Imprint + privacy pages (full pages)

These are **full legal pages, not image-only.** The hosted image
(`<legal-assets-host>/legal/{imprint,privacy}.png`) carries the operator identification /
contact block (so contact details aren't scrapable as plain text); everything else on the page
is **real rendered legal text you keep.** Use the templates below — do NOT ship a page that is
only the image.

Use the hosted images from **the repo's brand package (`@<scope>/brand`)** (`LEGAL_IMPRINT_IMG` / `LEGAL_PRIVACY_IMG`) rather
than hardcoding — they resolve to:

- Imprint image: `https://<legal-assets-host>/legal/imprint.png`
- Privacy image: `https://<legal-assets-host>/legal/privacy.png`

Both pages must:

- Set the header: `Astro.response.headers.set('X-Robots-Tag', 'noindex, nofollow')`
- Render inside `<Layout indexable={false}>` (adds the `noindex` meta)
- Render the hosted `<img … class="w-full" loading="lazy" />` block **plus the full text sections**
- Cross-link each other (`/imprint` ↔ `/privacy`)

**German copy: use real umlauts (ä, ö, ü) and ß — never `ae`/`oe`/`ue`/`ss` transliteration**
(e.g. `Datenschutzerklärung`, `Aufsichtsbehörde`, `Löschung`, `größter`, `Straße`, `Änderungen`).

`src/pages/imprint.astro`:

```astro
---
import Layout from "../layouts/Layout.astro"
import { LEGAL_IMPRINT_IMG } from "@<scope>/brand"
import { SITE_NAME } from "../consts"

Astro.response.headers.set("X-Robots-Tag", "noindex, nofollow")
---

<Layout
  title={`Impressum | ${SITE_NAME}`}
  description="Impressum und Anbieterkennzeichnung."
  indexable={false}
>
  <div class="legal-content">
    <h1>Impressum</h1>

    <img src={LEGAL_IMPRINT_IMG} alt="<operator>" class="w-full" loading="lazy" />

    <hr />

    <h2>Verbraucherstreitbeilegung (§ 36 VSBG)</h2>
    <p>
      Wir nehmen an einem Streitbeilegungsverfahren vor einer
      Verbraucherschlichtungsstelle teil. Zuständig ist die
      Universalschlichtungsstelle des Zentrums für Schlichtung e. V.,
      Straßburger Straße 8, 77694 Kehl am Rhein,
      <a href="https://www.verbraucher-schlichter.de" target="_blank" rel="noreferrer">
        www.verbraucher-schlichter.de
      </a>.
    </p>

    <hr />

    <h2>Haftung und Urheberrecht</h2>
    <p>
      Inhalte dieser Website wurden mit größter Sorgfalt erstellt. Für
      Richtigkeit, Vollständigkeit und Aktualität wird jedoch keine Gewähr
      übernommen. Bei Kenntnis von Rechtsverstößen entfernen wir betroffene
      Inhalte unverzüglich.
    </p>
    <p>
      Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung
      für Inhalte externer Links. Für den Inhalt verlinkter Seiten sind
      ausschließlich deren Betreiber verantwortlich.
    </p>
    <p>
      Texte, Bilder und Grafiken auf dieser Website sind urheberrechtlich
      geschützt. Jede Nutzung außerhalb der gesetzlichen Schranken bedarf der
      vorherigen Zustimmung.
    </p>

    <p>
      Es gilt das Recht der Bundesrepublik Deutschland, Gerichtsstand &lt;Ort&gt;.
    </p>

    <hr />

    <p>
      <a href="/privacy" class="underline">Datenschutzhinweise findest du hier.</a>
    </p>
  </div>
</Layout>
```

`src/pages/privacy.astro` — update the `Stand:`/`Version:` line when you ship:

```astro
---
import Layout from "../layouts/Layout.astro"
import { LEGAL_PRIVACY_IMG } from "@<scope>/brand"
import { SITE_NAME } from "../consts"

Astro.response.headers.set("X-Robots-Tag", "noindex, nofollow")
---

<Layout
  title={`Datenschutzerklärung | ${SITE_NAME}`}
  description="Datenschutzerklärung."
  indexable={false}
>
  <div class="legal-content">
    <h1>Datenschutzerklärung</h1>
    <p><strong>Stand:</strong> TT.MM.JJJJ, <strong>Version:</strong> 1.0</p>
    <p>
      Diese Datenschutzerklärung wird aktualisiert, sobald sich rechtliche,
      technische oder organisatorische Änderungen ergeben.
    </p>

    <hr />

    <img src={LEGAL_PRIVACY_IMG} alt="<operator>" class="w-full" loading="lazy" />

    <h3>Datenschutzbeauftragter</h3>
    <p>
      Es ist kein Datenschutzbeauftragter benannt, da die gesetzlichen
      Voraussetzungen nach Art. 37 DSGVO i. V. m. § 38 BDSG derzeit nicht
      vorliegen.
    </p>

    <h3>Zuständige Aufsichtsbehörde</h3>
    <p>
      <!-- The data protection authority of the operator's federal state -->
      &lt;Aufsichtsbehörde&gt;<br />
      &lt;Anschrift&gt;<br />
      E-Mail: &lt;E-Mail der Behörde&gt;
    </p>
    <p>
      Du hast das Recht, dich bei einer Aufsichtsbehörde zu beschweren (Art. 77
      DSGVO).
    </p>

    <hr />

    <h2>2. Allgemeine Informationen</h2>
    <h3>2.1 Rechtsgrundlagen</h3>
    <ul>
      <li>Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)</li>
      <li>Art. 6 Abs. 1 lit. b DSGVO (vertragliche Anfragen, falls einschlägig)</li>
      <li>Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Pflichten, falls einschlägig)</li>
    </ul>

    <h3>2.2 Deine Rechte</h3>
    <ul>
      <li>Auskunft (Art. 15 DSGVO)</li>
      <li>Berichtigung (Art. 16 DSGVO)</li>
      <li>Löschung (Art. 17 DSGVO)</li>
      <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
      <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
      <li>Widerspruch (Art. 21 DSGVO)</li>
    </ul>

    <h3>2.3 Speicherdauer</h3>
    <p>
      Personenbezogene Daten werden gelöscht oder anonymisiert, sobald der
      jeweilige Zweck entfällt und keine gesetzlichen Aufbewahrungspflichten
      entgegenstehen.
    </p>

    <hr />

    <h2>3. Hosting und technische Bereitstellung (Cloudflare)</h2>
    <p>
      Diese Website wird auf Cloudflare-Infrastruktur bereitgestellt (Cloudflare
      Workers / CDN). Dabei werden technisch erforderliche Verbindungsdaten
      verarbeitet, insbesondere:
    </p>
    <ul>
      <li>IP-Adresse</li>
      <li>Datum und Uhrzeit der Anfrage</li>
      <li>aufgerufene URL</li>
      <li>User-Agent und technische Fehler-/Sicherheitsereignisse</li>
    </ul>
    <p>
      Die Verarbeitung erfolgt zur sicheren Bereitstellung der Website, zur
      Stabilität, Fehleranalyse und zur Abwehr von Missbrauch (Art. 6 Abs. 1
      lit. f DSGVO).
    </p>

    <h3>3.1 Drittlandtransfer</h3>
    <p>
      Eine Verarbeitung durch Cloudflare kann auch in Drittstaaten (insbesondere
      USA) erfolgen. Cloudflare verwendet dazu gängige Datenschutzgarantien
      (z. B. SCCs / DPF, soweit anwendbar).
    </p>

    <hr />

    <h2>4. Cookies und Tracking</h2>
    <p>
      Auf dieser Website werden derzeit keine Marketing- oder Profiling-Cookies
      eingesetzt. Sollten in Zukunft zustimmungspflichtige Technologien
      eingesetzt werden, wird diese Datenschutzerklärung entsprechend
      aktualisiert.
    </p>

    <hr />

    <h2>5. Kontaktaufnahme</h2>
    <p>
      Wenn du uns per E-Mail kontaktierst, verarbeiten wir deine Angaben zur
      Bearbeitung der Anfrage und für mögliche Anschlussfragen (Art. 6 Abs. 1
      lit. b bzw. lit. f DSGVO).
    </p>

    <hr />

    <h2>6. Änderungen dieser Datenschutzerklärung</h2>
    <p>
      Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit sie
      stets den aktuellen rechtlichen Anforderungen und der tatsächlichen
      technischen Umsetzung der Website entspricht.
    </p>

    <p>Impressum: <a href="/imprint">/imprint</a></p>
  </div>
</Layout>
```

**If the site runs analytics, the privacy page MUST disclose it** — add a
"Webanalyse" section naming the house tracker (EU processing, pseudonyme Nutzungsdaten,
Art. 6 Abs. 1 lit. f DSGVO). Shipping a snippet while the privacy page still says
"kein Tracking" is a compliance bug.

Style both via a `.legal-content` block in `global.css` (`--muted-foreground`/`--border` come from
the app's design tokens):

```css
.legal-content {
  margin: 0 auto;
  max-width: 900px;
  padding: 2rem 1.25rem 3rem;
}

.legal-content h1 {
  margin: 0 0 1.25rem;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
}

.legal-content h2 {
  margin: 1.75rem 0 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.legal-content h3 {
  margin: 1.2rem 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.legal-content p,
.legal-content li {
  color: var(--muted-foreground);
  line-height: 1.7;
}

.legal-content ul {
  margin: 0.5rem 0 0.75rem;
  padding-left: 1.25rem;
}

.legal-content hr {
  margin: 1.25rem 0;
  border-color: var(--border);
}
```

**Terms of Service (AGB):** add a `terms.astro` (same `noindex` treatment) only when the
MVP is paid — link it from the footer near imprint/privacy.

## Analytics (the repo's tracker, as an Astro integration)

Use the tracker the repo already runs, added as an Astro integration in the config, never a
script tag pasted into the layout. Prefer a cookieless one: it needs no consent banner for the
MVP. Its host and key come from `PUBLIC_*` env vars; never hardcode a live hostname in the app.

Maelstrom's, as the shape to copy (its own package and a key written into `wrangler.jsonc` `vars`
by a repo script; with no key the integration injects nothing):

```js
import agentsgym from '@<scope>/agentsgym-astro'
import sitemap from '@astrojs/sitemap'
// integrations: [
//   agentsgym({ src: 'https://<analytics-host>/t.js', consent: true }),
//   sitemap({ filter: (page) => !page.includes('/imprint') && !page.includes('/privacy') }),
// ]
```

```
PUBLIC_<TRACKER>_KEY=
PUBLIC_<TRACKER>_HOST=https://<analytics-host>
```

Name the one goal the intake picked (`<core_action>`) and fire it from the core action's success
path; list every goal in the app's `EVENTS.md`.

**Enabling analytics obligates a privacy disclosure** — add the "Webanalyse" section to
`privacy.astro` (see the legal section above) in the same change. Don't ship analytics
against a "no tracking" privacy page.
