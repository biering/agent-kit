# X player card: the film playing inside the post

A player card makes X load one of your pages in an iframe inside the post. On
desktop the page runs right in the timeline. On mobile people see the poster
image first, tap it, and the page opens in X's in-app panel. It is how a film
(or a playable demo next to it) ships on X as more than a link.

It is the most interactive thing a link on X can do, and it fails silently: a
wrong tag, a redirect or a frame header and X falls back to a plain link card
without telling you why. So the work is five rules and one check.

## 1. Tags on the page you post

The page you post carries the tags. The iframe usually loads a different, smaller
page (the **player**), so the post URL stays a real page for everyone who clicks.

```html
<meta name="twitter:card" content="player" />
<meta name="twitter:player" content="https://example.com/embed" />
<meta name="twitter:player:width" content="640" />
<meta name="twitter:player:height" content="480" />
<meta name="twitter:image" content="https://example.com/poster.png" />
<meta name="twitter:title" content="…" />
<meta name="twitter:site" content="@handle" />
```

- Every URL absolute and `https`. A relative `twitter:player` or `twitter:image`
  is dropped.
- `twitter:image` is the poster: the only thing a mobile viewer sees before
  tapping, and the fallback wherever the player does not run. Make it worth a
  tap on its own. For a film, a still of the turn or the end card.
- `twitter:card` replaces `summary_large_image`. A page has one card type; keep
  the `og:*` tags as they are for every other network.
- Per-item players (`/embed?name=ada`) need the tag to change with the URL. On a
  static site that means rewriting the one `<meta>` at the edge (an
  `HTMLRewriter` in a Cloudflare Worker, for example) rather than building a page
  per item.

## 2. Let X frame the player

On the **player** page, not the page you post:

```text
Content-Security-Policy: frame-ancestors 'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com
```

and no `X-Frame-Options` header at all. `X-Frame-Options: DENY` or `SAMEORIGIN`
blocks X even when the CSP allows it. Check the hosting layer too: some
frameworks and security middlewares add `X-Frame-Options` by default.

On a Cloudflare Worker serving static assets, `public/_headers` sets it per path
and applies to responses the Worker hands through `env.ASSETS.fetch`.

## 3. Post the exact final URL

Twitterbot follows redirects poorly and caches whatever it got. Post the URL that
answers `200` directly: right scheme, right host (apex or `www`, whichever the
site does **not** redirect away from), right trailing slash. The player URL has
the same rule.

X caches a card per URL for days. After fixing tags, a new query string
(`?v=2`) is the reliable way to get a fresh card.

## 4. Build for the sandbox

X loads the player in a sandboxed iframe. Assume none of these work:

| Breaks | Do instead |
|---|---|
| `<form>` submit | `fetch()` from a click handler, or no form at all |
| Login, cookies, `localStorage` across visits | stateless; state in the URL |
| Links that navigate the frame | `target="_blank" rel="noopener"` on every link |
| `<a download>`, `window.open` popups, `alert`/`confirm` | link out to the full page for those |
| Clipboard writes | show the text selectable, or link out |

The player is a teaser for the full page, not a copy of it. Keep it to the one
interaction (or the one film) that makes someone stop scrolling, and put an
obvious "open the full thing" link on it. Mark it `noindex` with a canonical
pointing at the full page, and keep it out of the sitemap: it is a fragment,
not a destination.

## 5. Design for two screens

- **Desktop:** the player renders at your declared size (640x480 is the safe
  4:3) inside the post column, which is narrower than 640. Build it fluid:
  `100vw`/`100vh`, no page scroll, nothing fixed-width. A 16:9 film letterboxes
  inside it.
- **Mobile:** the viewer sees `twitter:image`, taps, and X's panel covers
  roughly the **bottom 30%** of the page. Put the interaction and the link out
  in the top 70%; let the bottom be decoration.

## Policy

X's own guidelines reserve player cards for linear audio and video, and say a
player must not need sign-in. A film fits that exactly. Interactive players work
in practice, but X can stop rendering one without notice, and then the poster
is all anyone sees. That is one more reason rule 1's poster has to stand on its
own.

## Check it live

After deploying, run the checker against the URL you will post:

```bash
node <skill>/scripts/player-card.mjs https://example.com/page
```

It fetches as Twitterbot with redirects off and checks: `200` with no redirect,
the card type, player size, the poster loads as an image, the player answers
`200`, sends no `X-Frame-Options`, and its `frame-ancestors` admits X. Exits
non-zero on any fail.

Then the human test, which no script replaces: post it from a test account (or
paste it into a draft and look at the preview), open it on desktop and on the
phone app.

## Done means

- [ ] Tags on the posted page, absolute https, `twitter:card` = `player`
- [ ] Player page: `frame-ancestors` admits X, no `X-Frame-Options`, `noindex`,
      canonical to the full page, out of the sitemap
- [ ] No forms, downloads, popups or clipboard in the player; every link
      `target="_blank"`
- [ ] Fluid at 640x480 and narrower; the interaction sits in the top 70%
- [ ] Poster works alone
- [ ] `player-card.mjs` passes against production
