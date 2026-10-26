# App Store: purchases, widgets and release

Everything an iOS surface needs beyond "it builds". Read it before adding a paid
tier, a widget, or the first submission, because three of the decisions below
are expensive to reverse once an app has shipped.

Placeholders: `<slug>` the app directory, `<Name>` the display name,
`com.<org>.<slug>` the bundle id.

## 1. Pick the purchase model before writing any of it

| Model | Use when | Do not use when |
|---|---|---|
| **Non-consumable** (one-time unlock) | The app is finished and the paid tier only *adds* to it | You intend to ship new content indefinitely |
| **Auto-renewable subscription** | There is genuinely recurring value: new content, a server you run, ongoing cost | The app is a tool that does one thing |
| **Consumable** | Credits, tips | Anything that unlocks a feature permanently |

A subscription is a promise to keep shipping. If nobody can name what arrives
next month, it is a non-consumable.

### StoreKit directly, or RevenueCat?

**Default to StoreKit** via `expo-iap`. It is a local bridge to the platform,
not a service: no backend, no third-party identifier, nothing leaves the device.
For a single non-consumable, `getAvailablePurchases()` is the entire entitlement
system, and Apple syncs it across the customer's devices for free.

**RevenueCat earns its keep on subscriptions and cross-platform.** Renewals,
grace periods, billing retry, upgrade and downgrade paths, and one entitlement
shared between iOS and Android are real work you should not rewrite. But it is
an SDK that phones home with a device identifier, which means a sub-processor,
a third-country transfer, and a privacy policy that can no longer say nothing
leaves the device.

The rule: **one non-consumable on one platform does not justify it.** A
subscription, or a second platform, does.

## 2. Never hardcode a price

```ts
// Wrong. This is a lie in every storefront but one.
const CTA = 'Unlock Plus for 5.99 EUR'

// Right. StoreKit knows the currency, the tax and the local tier.
export function plusCta(displayPrice: string) {
  return `Unlock Plus for ${displayPrice}`
}
```

Fetch `displayPrice` on launch, cache it so a returning customer never sees the
fallback flash, and keep a hardcoded string only for the moment before the
product loads. A price in source is also a price that goes stale the day a
scheduled price change starts.

## 3. There are no introductory offers on a non-consumable

Introductory and promotional offers are **subscription-only**. A launch discount
on a one-time unlock is a **scheduled price change** in App Store Connect: set
the base tier, then schedule a lower price with an end date.

Model it so the app cannot advertise a sale that is not running:

```ts
/** Last day of the launch price, or null when there is no sale. */
export const LAUNCH_ENDS: string | null = null

export function isLaunchPriceActive(today: string): boolean {
  return LAUNCH_ENDS ? today <= LAUNCH_ENDS : false
}
```

Default to `null`. While it is unset, or once the date has passed, the paywall
shows no discount copy at all. The worst case becomes an *unadvertised* sale
rather than a false claim, and the copy expires by itself rather than needing a
release.

During the window, name what the price returns to: `"Launch price. <list> from
<date>."` A discount that does not say what it is discounted from does no work.

## 4. Widgets are a second process

WidgetKit cannot read AsyncStorage, SecureStore, or anything else the app owns.
Mirror a snapshot into a shared App Group container and ask WidgetKit to redraw.

```
mobile/
├── targets/widget/
│   ├── expo-target.config.js   # type: 'widget', + the App Group entitlement
│   └── index.swift             # SwiftUI, one @main Widget
└── src/lib/
    ├── widget-snapshot.ts      # PURE: shape + maths, unit tested
    └── widget-bridge.ts        # native: ExtensionStorage + reloadWidget
```

Use `@bacons/apple-targets`. **Three identifiers must agree** or the widget
silently reads an empty container and renders its empty state forever:

1. `ios.entitlements['com.apple.security.application-groups']` in `app.config.js`
2. the same key in `targets/widget/expo-target.config.js`
3. the `APP_GROUP` constant the bridge writes with

**Split pure from native.** The snapshot's shape and maths belong in a file with
no native import, or the whole module becomes untestable under node and the
house rule that `src/lib` runs in plain node quietly breaks.

Publish on every event that changes what the widget draws, and swallow failures:
a stale widget is cosmetic, and it must never take down the thing that just
succeeded.

## 5. Config that must not be committed

`eas.json` is in git. So:

| Field | Commit? | Why |
|---|---|---|
| `ascAppId` | Yes | It is in the public App Store URL |
| `appleTeamId` | Yes | Visible inside every shipped bundle |
| `appleId` | **No** | A personal email address, permanently in history |

**One team key for the whole estate.** App Store Connect team keys are
account-scoped, not app-scoped, so a key already reaches every app in the team
including ones created later. A key per app is the same authority under another
name, plus a secret to rotate. Create one with the **App Manager** role: enough
for builds, metadata and purchases, short of Admin. The role cannot be widened
after creation, so getting it wrong means a new key, not an edit.

Authenticate with that **App Store Connect API key**: `eas credentials`,
choose the API key, and EAS stores it against the project. No Apple ID, no
password, no 2FA prompt, and it is the only option that works unattended.

The same key drives the release scripts, via `ASC_KEY_ID`, `ASC_ISSUER_ID` and
`ASC_KEY_PATH` in the environment.

Keep the `.p8` at `~/.appstoreconnect/private_keys/` (where Apple's own tools
look) and `chmod 600`. Put the ids in the **repo-root `.env`**, not a per-app
one: it is an account credential, so a copy per app is a copy per app to rotate.
A gitignored `.env` does not propagate into a git worktree, so any ops script
reading repo-wide credentials must fall back to the main checkout (resolve it
with `git rev-parse --git-common-dir`). Otherwise every command run from a
worktree reports the credentials as missing, which is indistinguishable from a
revoked key. Check the key resolves (Maelstrom: `pnpm iap --check`) before a release depends on it. For CI,
base64 it with `openssl base64 -A`; without `-A` the output wraps and the
decoded key is corrupt in a way that only appears as a signing failure.

## 6. Put the store listing in git

`mobile/store.config.json` holds name, subtitle, description, keywords,
categories and URLs for `eas metadata`:

```bash
pnpm --filter <slug>-mobile metadata:lint    # validate before pushing
pnpm --filter <slug>-mobile metadata:push    # sync to App Store Connect
```

Listing copy reviewed in a pull request beats listing copy retyped into a web
form. Lint it: the command reports the exact field it dislikes.

**Screenshots push with the listing**, from the `screenshots` block in
`store.config.json`. A screenshot failure does not change the exit code
([eas-cli#3689](https://github.com/expo/eas-cli/issues/3689)), so confirm with
`eas metadata:pull`. `metadata:lint` has no opinion on whether the listing's
URLs resolve; `pnpm store:urls <slug>` does, and a dead `supportUrl` is a
guideline 1.5 rejection.

## 7. The in-app purchase is not covered by eas metadata

`eas metadata` syncs the listing and **not** the purchase. Create it through the App Store
Connect API from a repo script that reports by default and writes only under `--apply`
(Maelstrom's is `pnpm iap <slug> [--apply]`):

```bash
pnpm iap <slug>              # report: what the app declares vs what exists
pnpm iap <slug> --apply      # create the product and its localization
```

It reads the product id, name and description out of the app's own source, so
**the app is the source of truth**. That direction is the point: a product id
that disagrees with the one passed to StoreKit compiles, ships, and fails only
when a customer taps Buy.

Keep the declarations where the script expects them:

- `mobile/src/lib/entitlement.ts` — product id, prices, launch window
- `distribution/app-store/README.md`: the review note, and one `### <locale>`
  section per language, each with a `Display Name` and `Description` row whose
  value sits in backticks. The script parses those headings, so the heading is
  the locale code and nothing else.

## 8. The rest of the release is also commands

Everything after the purchase object has an App Store Connect API endpoint. Script it the
same way, reading by default and writing only under `--apply`. Maelstrom's set, as the shape
to copy:

```bash
pnpm release <slug>                            # report price, review screenshot, submission
pnpm release <slug> --price --apply            # schedule the tier from entitlement.ts
pnpm release <slug> --iap-screenshot --apply   # upload the purchase's review capture
pnpm release <slug> --submit --apply           # attach the build, then send it for review
pnpm devices --add <udid> --name "…"           # register a phone, no Apple login
pnpm store:urls <slug>                         # do the listing's URLs resolve
```

**`eas submit` uploads the binary and stops.** It does not create the version
record, attach the build to it, or submit anything. A binary can sit in App
Store Connect indefinitely, belonging to no version, while the console looks
busy. `--submit` attaches the newest VALID build and then sends the submission.

**A review submission needs an explicit send.** The old
`appStoreVersionSubmissions` endpoint submitted on create; `reviewSubmissions`
does not. One left in `READY_FOR_REVIEW` has items, looks finished, and is being
reviewed by nobody.

## 9. What no tooling can do

- **Creating the App record.** `POST /v1/apps` supports no CREATE at any key
  role. This is a platform limit, not a permissions gap.
- **The Paid Applications Agreement, and the bank and tax details** behind it.
  Nothing sells until they are accepted and complete. See
  `app-store.md`, which is the list of blockers that are nobody's
  code.
- **Capturing** the review screenshot: a real capture of the paid surface on a
  device. Uploading it is a command; making it is not. Generating a mockup and
  submitting it is the kind of shortcut review exists to catch.
- **App Privacy and the age rating**, which are questionnaires.
- **Running the native code.** Purchases, HealthKit, notifications and haptics
  compile and bundle without ever executing. The first development build is
  where they are actually tested, and it needs budgeting before review time.

**Re-check this list before believing it.** Two of the entries that used to be
here (the price tier and the review-screenshot upload) were documented as
impossible long after they stopped being, because a documented limitation is
the one thing nobody re-tests.

## 10. Testing the purchase, before Apple will help you

A purchase is the one path that cannot be tested by reading it, and the obvious
routes are blocked exactly when you first need them.

**App Store Connect does not serve a product in `MISSING_METADATA` to sandbox.**
Until the in-app purchase has a price and a review screenshot, `fetchProducts`
returns an empty array in both sandbox and TestFlight. The paywall then shows
its fallback price and nothing anywhere says why. Budget for this: the sandbox
route is unavailable for as long as the purchase is incomplete, which is the
whole period you are building it.

So test in this order:

**1. A StoreKit configuration file, for the whole dev loop.** A local `.storekit`
file makes Xcode answer instead of Apple. No App Store Connect, no sandbox Apple
ID, no signing out of a real account, and it runs in the simulator. It also
produces the cases that are painful to stage for real, through Xcode's StoreKit
Transaction Manager: cancelled and failed purchases, refunds, and the
interrupted "Ask to Buy" path, which is the one that usually ships broken.

The file's `productID` must equal the id the app asks StoreKit for, or the app
requests a product the local store does not have and you debug the wrong thing.

The catch under Expo: the file is selected in the **Xcode scheme**, and
`expo prebuild` regenerates `ios/`, so the setting is wiped every time. It needs
a config plugin to survive, gated behind an environment variable so a production
build can never carry a fake store:

```js
module.exports = (config) => {
  if (process.env.<APP>_STOREKIT_LOCAL !== '1') return config
  return withStoreKitScheme(withStoreKitFile(config))
}
```

Attach it to the scheme's `LaunchAction` only. `xcodebuild archive` uses
`ArchiveAction` and ignores it, which is a second layer of the same protection.

**Two things that will cost you an evening otherwise:**

- **The local store only works when the app is run from Xcode.** The `.storekit`
  file is not copied into the app bundle and the binary links only the real
  StoreKit; Xcode injects the test store as it launches. An app installed and
  launched by `simctl` — which is what `expo run:ios` does — cannot reach it.
  The workflow is prebuild, then open the workspace and press Run.
- **Removing the flag must actively un-apply.** `expo run:ios` prebuilds only
  when the native directory is *absent*, so one opted-in prebuild otherwise
  leaves the fake store wired into every later local run with the variable
  unset, and "purchases work" stops meaning anything. Delete the reference and
  the copied file when the flag is off, rather than returning early.
The reference is a path relative to the `.xcscheme`, which sits three levels
inside the project:

```js
const reference =
  `      <StoreKitConfigurationFileReference\n` +
  `         identifier = "../../../<Name>.storekit">\n` +
  `      </StoreKitConfigurationFileReference>\n`
// anchor on the closing tag, which is stable across SDK versions
writeFileSync(scheme, xml.replace('   </LaunchAction>', reference + '   </LaunchAction>'))
```

**2. A sandbox tester on a real device, once the price is set.** The first test
of the real StoreKit path: real receipts, real Apple ID, real restore across
devices. This is also the only way to check anything a second process owns — a
widget reading a shared App Group cannot be verified in the simulator's fake
store.

**3. TestFlight, once, before submitting.** Purchases are automatically sandbox
and free. Closest to production, slowest loop. Use it to confirm, not to iterate.

## 11. Health, wellness and anything adjacent to a claim

Apple rejects apps that imply medical benefit. If the app touches breathing,
sleep, mood or activity:

- Carry a "not a medical device" disclaimer in the imprint and the listing.
- Say what it does not do: no diagnosis, no treatment, no advice.
- **Make the safety boundary a test, not a convention.** If content has a range
  that would be unsafe outside it, assert the range. A convention is forgotten;
  a failing test is not:

```ts
it('never ships a pattern outside the safe range', () => {
  for (const preset of PRESETS) {
    expect(maxHold(preset)).toBeLessThanOrEqual(SAFE_MAX_HOLD)
  }
})
```

- Answer App Privacy honestly. "Data collected: none" is a real answer, and it
  is much easier to defend than a partial one.

## 12. Release order

1. Bundle id and capabilities in the Developer portal, plus the App Group if
   there is a widget.
2. App record in App Store Connect. Note the numeric id, it is `ascAppId`.
3. `eas init`, then `eas credentials` with the API key.
4. Create the purchase (the repo's IAP script, or App Store Connect), then set the price tier by hand.
5. `pnpm --filter <slug>-mobile metadata:push`.
6. `eas build --profile development`, install on a device, and work through the
   native checklist. **Expect to fix things here.**
7. `eas build --profile production`, then `eas submit`.
8. Capture the review screenshot from the real build, attach it to the purchase,
   and submit the purchase *with* the first build, not after.

## The App Store blockers that are nobody's code

`app-store.md` covers the purchase and the commands. This is the other half: the
things that stop a release and that no script can do for you. They
are here because every one of them was discovered late on a real submission,
where "late" means after a build was already uploaded.

Read this **at intake**, not at submission. Half of it changes what you build.

### Before anything can be sold

**The Paid Applications Agreement.** Until it is accepted in App Store Connect,
and the bank and tax details behind it are complete, no in-app purchase sells.
The product sits unavailable and `fetchProducts` behaves as if it does not
exist, which is indistinguishable from a bug in your own code. For an operator
outside the US this means tax forms (W-8BEN-E and a tax-residency declaration)
that take days to clear, not minutes. Start it on day one.

Apple is merchant of record for in-app purchases and handles EU VAT, which is
why an app's IAP revenue is not the same conversation as a web checkout. The
Small Business Program drops commission to 15% under $1M/year and has to be
applied for.

**EU trader status.** Mandatory since February 2025 for distribution in EU
storefronts under the DSA. An app without a verified trader name, address, phone
and email is simply not distributable there. Apple verifies the details, so it
is not a form you fill in on submission day. For an EU-based operator selling to
an EU market this is the single most likely silent blocker.

### Review rules that change what you build

These are not paperwork. Each one is a feature you must have written.

**Sign in with Apple (guideline 4.8).** An app that offers a third-party login
(Google, Facebook, anything with an account) on iOS must also offer Sign in with
Apple. Deciding this after the auth screens are built is a rewrite of the auth
screens.

**In-app account deletion (guideline 5.1.1(v)).** Any app that lets someone
create an account must let them delete it from inside the app. A support email
is not acceptable. This is a real screen, a real destructive flow, and a real
backend path.

**A visible Restore Purchases control.** Required for non-consumables.
`getAvailablePurchases()` restoring silently at launch is good behaviour and is
not sufficient: review looks for something the customer can tap.

### Configuration that rejects builds

**`ITSAppUsesNonExemptEncryption`.** Without it in `ios.infoPlist`, every single
upload stops for the export-compliance questionnaire. `false` is correct for an
app whose only cryptography is standard HTTPS.

**`NS*UsageDescription` purpose strings.** A missing one is both a runtime crash
the moment the permission prompt appears and an automated rejection
(ITMS-90683). Every framework that touches a permission needs its string, in
`app.config.js`, before the first build.

**`PrivacyInfo.xcprivacy`.** Required-reason API declarations. Expo covers its
own modules; anything the app itself does with those APIs is the app's to
declare.

**Push notifications need an APNs key**, uploaded to EAS. Local notifications
need nothing. These are different features that sound the same, and ticking the
Push Notifications capability for an app that only schedules local reminders
buys a credential you then have to maintain.

### Version numbers

`CFBundleShortVersionString` is the marketing version, `CFBundleVersion` the
build number. The build number must be unique per upload and Apple rejects a
repeat. `"appVersionSource": "remote"` plus `"autoIncrement": true` in
`eas.json` makes EAS own it, which is the only arrangement that does not
eventually collide.

### Shipping after launch

**EAS Update changes the economics.** A JavaScript-only fix ships in minutes
without review; anything touching native code does not. That distinction decides
how you structure a fix under pressure, and it needs `runtimeVersion` and a
channel model chosen before you need it rather than during an incident.

**TestFlight.** Internal testers are immediate. External testers need Beta App
Review, which is a real queue. Builds expire after 90 days. Use TestFlight to
confirm a release candidate, not to iterate.

**Phased release and manual release.** A version can go live automatically on
approval or wait for a button. Approval is not the same event as availability,
and assuming it is turns a launch into a surprise.

**Crash reporting is not free.** With no analytics SDK, App Store Connect's own
Crashes view is the only source, and it needs dSYMs to be readable. Decide
before launch, because the first production crash is a bad time to discover
there is no path from a stack trace to a line of code.

### Questionnaires

App Privacy, the age rating, content rights, and the advertising-identifier
question. All are per-version, all block submission, and all are answered in the
console. "Data collected: none" is a real and acceptable answer; give it
honestly, because the privacy page and the listing have to agree with it.

### When it is rejected

Rejection arrives in Resolution Center and is a conversation, not a verdict.
Reply there. Rejecting your own build to fix something resets the queue
position, so a metadata-only fix is worth checking against a metadata-only
rejection first. An in-app purchase can be rejected independently of the app.
Expedited review exists and is for genuine emergencies.

Record what the rejection said somewhere durable. The second submission of the
next app is where that note pays for itself.
