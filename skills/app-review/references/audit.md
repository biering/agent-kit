# Pre-submit audit

Walk this on a real build, signed in the way a reviewer will be. Each line is a
yes or no. Fix every no before submitting, or say in the notes why it is a no.

## Quality and polish

- [ ] No screen says "coming soon", "beta", "placeholder" or shows lorem ipsum, a dead button or an empty state with no explanation.
- [ ] Every control does something. Every link opens a live page (support, privacy, terms).
- [ ] The app works with no network, or says clearly what it needs the network for.
- [ ] No crash on first launch, on a fresh install, on the smallest and largest supported iPhone, in the supported languages.
- [ ] Anything the listing or screenshots show exists in this build, exactly as shown.

## Payments

- [ ] The purchase works end to end in sandbox: buy, unlock, restore, and the failure paths.
- [ ] A visible Restore Purchases control exists for non-consumables.
- [ ] Price, trial and renewal terms are shown before the buy button, from the store's own price, not a hardcoded number.
- [ ] Every in-app purchase is attached to this version, with a real review screenshot of the paywall.
- [ ] The paywall in the build is the paywall that will stay live. No remote switch that turns it non-compliant later.
- [ ] Free features stay free. Nothing the old version gave away is now locked without saying so.

## Honesty and dark patterns

- [ ] No review prompt in onboarding or right after a purchase prompt. Ask after a good moment, rarely.
- [ ] No fake social proof: no "#1 on the App Store", no invented ratings, no made-up user counts.
- [ ] No absolute claims: "fixes 100%", "cures", "guaranteed". Health-adjacent wording stays modest.
- [ ] No fake urgency, no hidden close button, no pre-ticked consent.
- [ ] Not a near copy of another app's screens, name, icon or flow.
- [ ] Risky patterns are held back for a later version (see scope.md): offers shown when someone abandons a purchase, offers on a "manage subscription" exit.

## Permissions and data

- [ ] Each permission is requested at the moment its value is obvious, never as a batch at launch.
- [ ] Each `NS*UsageDescription` says what for, in plain words, in every supported language.
- [ ] Tracking: if nothing tracks across other companies' apps, there is no tracking prompt and the answer says so.
- [ ] App Privacy answers match the code and the privacy page. Anything sent off the device that we can read counts as collected, even if optional and anonymous.
- [ ] Privacy page, support URL and (if needed) terms load without login.

## Accounts, social and user content

- [ ] If people can create an account: they can delete it inside the app, and a demo account is in the notes.
- [ ] If the app offers a third-party login: Sign in with Apple is offered too.
- [ ] If the app shows user-generated content or lets people talk to each other: report, block, a contact-support button and a moderation process that is described in the notes.

## Metadata

- [ ] Name, subtitle and description make no claim the app cannot back and name no other product.
- [ ] Screenshots are the app as it runs, not mockups of features that do not exist.
- [ ] Age rating and content questionnaire answered honestly.
- [ ] The version's "what's new" text is true.
