# Consent gating (§ 25 TDDDG): verify in code and at runtime

Non-essential cookies and trackers need **prior opt-in**, and § 25 violations are fined up to
€300,000. This is where code review beats text review: prove the scripts do not fire before
consent.

1. **A CMP exists and loads first** (CCM19, Cookiebot, Usercentrics, Klaro). If the inventory
   found trackers but no CMP, that is **critical**: "trackers load unconditionally; add a CMP
   and gate them."
2. **Non-essential scripts are blocked pre-consent.** Read the tags: are Meta, Google and the
   analytics wrapped in the CMP's blocking mechanism (for example CCM19's script type or data
   attribute), or do they run on page load? A snippet pasted raw into `<head>` or before
   `</body>` with no gate is a finding. The common miss is a tracker or pixel added "quickly"
   that loads unconditionally.
3. **Runtime proof.** Build and inspect: before consent is accepted there must be **zero**
   requests to tracker domains.
   ```bash
   pnpm --filter <app> build   # or the repo's build command
   # In the built HTML, tracker scripts should be consent-blocked, not plain <script>:
   grep -RniE "connect.facebook|googletagmanager|posthog|fbq\(" <app>/dist | head
   ```
   Add the repo's own analytics to the grep. Then load a preview and check the network tab: no
   tracker requests until "Accept". After accept, they appear.
4. **Google Consent Mode v2** is set (defaults `denied` before consent) for any Google Ads or GA
   tag.
5. **Banner UX.** Reject is as easy as accept (equal-weight buttons), choice is granular per
   purpose, and it is revocable (a link that reopens the CMP). Note deviations.

An app on a cookieless analytics setup has no banner by design. There the check is that the init
options really keep it cookieless, plus the device-storage writes from the inventory.
