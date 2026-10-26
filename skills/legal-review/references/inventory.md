# Scope and stack inventory (steps 0 and 1)

## Find the legal pages and where they are linked from

```bash
APP=apps/<app>   # the target
# Legal page files
find "$APP/src" -iname '*imprint*' -o -iname '*impressum*' -o -iname '*privacy*' -o -iname '*datenschutz*' | grep -v node_modules
# Where the footer/links point (own pages vs. someone else's domain)
grep -rn "imprint\|impressum\|privacy\|datenschutz" "$APP/src" --include='*.astro' --include='*.tsx' --include='*.vue' -l
```

**Red flag:** an app that links its imprint or privacy page to *another* product's domain (a
side product linking the parent company's `/privacy`). Each production domain needs its own legal
pages that describe *its* stack. A shared policy lists services the site does not use
(over-disclosure) and misses ones it does (under-disclosure, the real risk).

## Inventory the actual tech stack

Grep the app for everything that touches personal data, sets cookies or storage, or makes an
outbound request to a third party. The table built here is what step 3 reconciles against the
privacy policy. Add the repo's own analytics package or beacon path to the first grep (the repo
doc names it).

```bash
APP=apps/<app>
# Analytics / tag managers / pixels
grep -rniE "gtag|googletagmanager|google-analytics|ga\(|dataLayer|fbq|connect\.facebook|facebook\.net|posthog|plausible|matomo|mixpanel|hotjar|clarity|segment" "$APP/src" | grep -v node_modules
# Consent tooling
grep -rniE "ccm19|cookiebot|usercentrics|klaro|consentmanager|onetrust|cookieconsent|consent" "$APP/src" | grep -v node_modules
# Payments / auth / maps / media / captcha / chat
grep -rniE "stripe|paypal|braintree|supabase|auth0|clerk|firebase|mapbox|google\.maps|maps\.googleapis|youtube|vimeo|recaptcha|hcaptcha|turnstile|intercom|crisp|whatsapp|calendly|cal\.com|calendar\.app\.google|hubspot|beehiiv|mailchimp" "$APP/src" | grep -v node_modules
# Externally loaded scripts / fonts / iframes (each is a potential US transfer + consent item)
grep -rniE "src=\"https?://|@import url\(|fonts\.googleapis|fonts\.gstatic|<iframe|cdn\." "$APP/src" | grep -v node_modules
# Cookies / device storage set client-side
grep -rniE "document\.cookie|localStorage|sessionStorage|setCookie" "$APP/src" | grep -v node_modules
# Hosting / edge (data processor + US transfer)
cat "$APP/wrangler.jsonc" "$APP/wrangler.toml" 2>/dev/null | head -5; ls "$APP" | grep -iE "wrangler|vercel|netlify|railway"
```

For each hit, record: **service · vendor + legal entity/country · sets cookies or storage? ·
personal data? · consent-required (non-essential) vs. essential · US transfer?**

## Common classifications

| Service | Vendor entity | Consent needed (§ 25 TDDDG) | US transfer |
|---|---|---|---|
| Cloudflare hosting/CDN/WAF | Cloudflare, Inc. (USA) | No (essential, Art. 6(1)(f)) | Yes, DPF/SCCs |
| Self-hosted, cookieless analytics | the operator | No, as long as nothing is written to the device; yes once an id is stored | No (self-hosted) |
| PostHog (EU cloud) | PostHog | **Yes** (non-essential analytics) | No regular transfer; UK support (adequacy) |
| Meta Pixel (fbq) | Meta Platforms Ireland Ltd. | **Yes** | Yes, DPF/SCCs; note Art. 26 joint control |
| Google Ads tag (gtag.js) | Google Ireland Ltd. | **Yes** + Consent Mode v2 | Yes, DPF/SCCs |
| Google Fonts (self-hosted) | (none) | No | No |
| Google Fonts (from gstatic) | Google | **Yes** (loads from Google on request) | Yes |
| Stripe | Stripe | Contract (essential for checkout); its cookies need consent | Yes |
| Google Calendar embed/link | Google Ireland Ltd. | Link: no script; embed: yes | Yes |
| CCM19 consent tool | Papoo Software & Media GmbH | No (essential consent cookie, § 25(2)(2)) | No |

Check a tracker's integration options before classifying it: a consent flag that stores an id
after "Allow" moves it from the first row's "no" to "yes".

**Note both directions:** services in the code (must appear in the policy) and anything in the
policy with no code counterpart (stale: remove it, or confirm it is used server-side).
