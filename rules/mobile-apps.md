# Mobile app rules

Rules every mobile app follows, in every repo that vendors this kit. Short on
purpose: follow them, and put the app-specific detail in the app.

## 1. Analytics consent, not ATT

- First-party analytics (the repo's own provider, or agentsgym through
  `@maelstrom/agentsgym-expo` in Maelstrom) is not Apple "tracking". No ATT
  prompt, no `NSUserTrackingUsageDescription`.
- GDPR, TDDDG section 25 and App Review 5.1.1 still require consent before any
  ID is stored or usage is sent. Ask with your own opt-in in onboarding: Yes and
  No with equal weight, and nothing sent before Yes.
- Add a Settings switch. Turning it off deletes the ID.
- Ship the disclosures in the same change: privacy page, FAQ, privacy manifest
  `NSPrivacyCollectedDataTypes`, App Privacy answers, and the event catalogue
  (`EVENTS.md`).
- Use ATT only if an ads or attribution SDK (Meta, TikTok, AppsFlyer) is added.
  Then ask in context, never at first launch, and declare tracking. Prefer
  AdAttributionKit or SKAdNetwork, which need no ATT.
- Purchases: pass the analytics ID as the StoreKit `appAccountToken`, so revenue
  joins the user.

## 2. Review prompt

- Use Apple's `SKStoreReviewController` (`expo-store-review`) only. Never add a
  custom pre-prompt or a rating gate: guidelines 1.1.7 and 5.6.1 forbid steering
  ratings.
- Ask right after a success moment, a completed core action. Never after an
  error, never on launch.
- Wait until the user has had value several times, for example on the 3rd
  completed core action.
- Once per install, plus at most one later ask at a milestone after 120+ days.
  Apple caps the prompt at 3 a year and may not show it at all.
- Record that you asked. Never block the UI on it.
- Add a "Rate" link in Settings to the App Store write-review URL
  (`https://apps.apple.com/app/id<APP_ID>?action=write-review`) for people who
  want it.

## 3. Onboarding

- At most 3 to 4 screens, and skippable.
- Show the core value first. Then personalise: the choices set real settings.
  Then land the user in the core action at once, so the first success comes
  within a minute.
- Ask for each permission (notifications, analytics consent) in context, only
  when its value is clear. Never as a batch at launch.
- A paywall after onboarding is allowed, but it must be dismissible.
- Show it once and persist completion.
- Respect reduced motion.
- Track onboarding steps reached, skipped and completed, after consent.

## 4. App Review submission

Method and checklists: the `app-review` skill (`skills/app-review/SKILL.md`).

- **Review notes on every submission**, in a fixed order: what the app does,
  how to reach each feature, the paywall and how to test the purchase in
  sandbox, the data collected and why, anything unusual. Short bullets, plain
  words, written for a total beginner.
- **A demo video on every first submission** and on any update that changes how
  something works: a screen recording with a text caption on each section,
  attached in App Review Information. Highest return of all these steps.
- **Expedited review** is for critical bugs, events and marketing moments. No
  reason is required. Do not overuse it.
- **Request a call** when a submission is unusual or a rejection stays unclear
  after one written exchange. Few developers do, and it can be a shorter queue.
- **Ask for all rejection reasons in one go** before resubmitting. Challenge a
  wrong rejection politely, with the guideline number and evidence.
- **Scope:** keep the first submission an MVP. A plain review takes about two
  days; escalation to a specialist can take about two weeks. Hold risky
  patterns (offers on purchase abandon or on "manage subscription") for later
  updates, explain them in the notes and show them in the demo.
- **Audit before submit:** nothing unfinished or "coming soon", payments work,
  no remote paywall that turns non-compliant after review, no review request in
  onboarding, no fake social proof or absolute claims, no copy of another app.
  Permissions are asked in context. Apps with user content need report, block,
  a contact-support button and moderation.
