# iOS

nanoMuse on the iPhone is the iOS half of OpenMinis 1.13 under nanoMuse's name, built by CI on a
Mac runner and handed to TestFlight. This page says what is in the tree, how it is built, what
the TestFlight pipeline needs, and what is still to be ported from the Android app.

**Status.** The tree, the branding, the nanoMuse Cloud sign-in, the hub client and the pipeline
were written on a Linux machine. The app **builds, signs and is on TestFlight**: build 0.1.31 (2)
went through the *iOS · TestFlight* workflow on 2026-10-03, was processed by App Store Connect
and is with the internal testers (*Where it stands* below). It has not been run on an iPhone by
the maintainers themselves, so the sign-in flow, the Devices section and notifications from other
devices are untested at runtime until the first tester reports. The first archive taught the
pipeline that automatic signing wants a registered device, which is why it signs manually now.

## Where it lives

`android/` is the whole OpenMinis repository as a `git subtree`, not just the Android app. The
iOS half was deleted when the project started and is now restored **inside that subtree**, at
`android/src/ios`, together with the iOS dependency scripts under `android/deps/` and the
`android/deps/ish` submodule (the ARM64 iSH fork). Putting it back where upstream keeps it, rather
than in a second subtree, is what keeps `git subtree pull` working for both platforms at once.

```
android/src/ios/                 the Xcode project: Minis.xcodeproj, app, extensions, tests
android/src/ios/NanoMuse/        ours: nanoMuse Cloud client and screens (a synchronized folder
                                 of the Minis target; drop a .swift file in, it is compiled)
android/src/ios/fastlane/        the TestFlight lane
android/deps/build_lame.sh       LAME → FFmpeg → iSH → Alpine rootfs → rclone, in that order
android/deps/build_ffmpeg.sh
android/deps/build_ish.sh
android/deps/prepare_alpine_rootfs.sh
android/deps/build_rclone_ios.sh
scripts/rebrand.py               the `ios()` step: ids, names, versions, strings, links, colours
scripts/gen-ios-icons.py         the app icon and the four alternates, from assets/brand/
.github/workflows/ios-testflight.yml
```

The rules of [CONTRIBUTING.md](../CONTRIBUTING.md) apply unchanged: new code in new files (here:
the `NanoMuse/` folder), an edit inside an upstream Swift file carries a `// nanoMuse:` comment,
and rebranding is the script, never a hand edit.

## What is nanoMuse here

Applied by `python scripts/rebrand.py` (idempotent; run after every upstream pull):

- **Identity.** Bundle ids `io.github.nanomuse.app` (+ `.ShareExtension`, `.AgentWidget`,
  `.FileProvider`), the app group `group.io.github.nanomuse.app`, the iCloud container
  `iCloud.io.github.nanomuse.app`, the background-task, UTType and URL-scheme ids that carry the
  bundle id. Unlike Android there is no source-package constraint on iOS, so the whole family
  moves. The `minis://` and `minis-mcp://` schemes stay: they are upstream's contract with its
  own sandbox.
- **Names.** Display name nanoMuse, "Share to nanoMuse", "nanoMuse Files"; "Minis" → "nanoMuse"
  in Swift string literals, in `Localizable.xcstrings` (keys renamed, all nine translations
  updated) and in the Info.plist usage descriptions in every language. The OpenRouter
  `HTTP-Referer` keeps pointing at OpenMinis, as on Android: it is attribution, not identity.
- **Versions.** `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` follow the Android
  `versionName` / `versionCode`; CI overrides the build number with the run number.
- **Look.** AccentColor `#015CFB` / `#58A6FF` instead of iOS blue; the one-stroke N as the app
  icon (white tile, brand gradient; a dark tile for the dark appearance) and as the four skins of
  the in-app icon picker; the agent's header glyph 🐾 instead of ✨.
- **About.** Links to this repository and its issues, the privacy page, nanoMuse's own tagline,
  and a Credits section: based on OpenMinis 1.13 (GPL-3.0), not affiliated with Meta.

Ours, in `NanoMuse/`:

- **nanoMuse Cloud.** *Providers* opens with a "nanoMuse Cloud" row: a phone number or an
  e-mail address, a code, and the relay ([cloud.md](cloud.md)) is an ordinary OpenAI-compatible
  provider in the app, with a model group of its own that becomes the default when there is none.
  Same wire format and the same rules as the Android client (`io.github.nanomuse.cloud`): one
  instance per relay, nothing of the user's own replaced, a 401 on refresh removes the provider.
  Debug builds can point at another relay. Since 0.1.32 the page is the whole account — the
  password as the other way in, a friend's invite code, the pool in yuan with the ways on when it
  runs low (your own key, an invitation, a star once), usage by kind and by model, the devices
  holding a key, the timeline, deletion — the same sections as the phone's `CloudAccountScreen`.
- **The agent's steps, the status line.** *Settings → Chat → Steps* keeps the tool capsules out of
  finished messages unless asked for; the typing line reads *〈name〉 is on it*, not *is thinking*.
  Both are one-line edits in upstream's `AssistantBlockView` / `ContentView`, marked `// nanoMuse:`.
- **The Muse shell (0.1.33), iPhone only.** `NanoMuseRoot` replaces upstream's `ContentView` at
  the root on the iPhone (the iPad keeps the split layout; `nanomuse.shell.enabled` /
  `nanomuse.header.enabled` in UserDefaults switch the shell and the header off, no UI toggle
  yet). The chat's navigation title becomes **face · name · status line** (`NanoMuseHeader.swift`):
  the status reads *waiting for you* while a question or an approval is up, then the running
  tool's `tool_title` — the model's own words for the step, *打开携程网站* — then *writing the
  reply*, then *On it: 〈brief〉*, and the model's name when idle; the face (`NanoMuseFaces.swift`,
  the drawn face from Application Support or the dragon from the bundle, five moods with the
  breath, bob, tilt, pop and shake of the other clients) is tapped into the avatar studio. The
  bottom bar carries the rooms (`NanoMuseRooms.swift`): **Ideas** (bundled `ideas.{en,zh}.json`,
  *Send to chat*) and **Library** (the sessions' workspace files, QuickLook, share, *Open
  conversation*) are real; **Feed** and **Goals** are empty states, since the iPhone has no
  scheduler to run them (*Create a goal* starts a chat). The drawer holds the sessions, search, a
  new side chat, *Pin as the main chat*, and *All chats* / *Settings*, which open upstream's layout
  in a sheet.
- **The avatar studio** (`NanoMuseAvatarStudio.swift`, `NanoMuseProfile.swift`): the styles and
  prompts of the Android studio, four candidates drawn in parallel through the relay
  (`/v1/images/generations`, `/v1/images/edits` for the posed moods), a cost sheet first (eight
  pictures, the estimate against what is left), the pick adopted and pushed to the account's
  profile (`PUT /v1/me/profile`, pulled on start and on the hub's `profile` frame by `rev`) so
  every device changes with it. Through the relay only — no own-key image path on iOS.
- **Connectors** (`NanoMuseConnectors.swift`): the desktop's catalogue from the bundled
  `connectors.json` (`node scripts/connectors-json.mjs` keeps it current, `--check` in CI), the
  MCP authorization flow (initialize → 401 → protected-resource metadata → authorization-server
  metadata → RFC 7591 registration → upstream's `MCPOAuthController`), key / open / auto services,
  and the client-id ask with the callback address to copy for the eight services that register no
  clients. The Settings row that was *MCP Integrations* is **Connectors**; *Your own servers* at
  its end is upstream's MCP page.
- **Data controls** (`NanoMuseDataControls.swift`): the relay's switch, the kept-turns count, the
  privacy page, deletion with a confirmation. **Reach** (`NanoMuseReach.swift`): a sheet per device
  of the account — open a link, send a note, a shell line, a screenshot — over the hub.
- **Star asks** at the first and the tenth finished task (`NanoMuseStarWatch`: a session leaving
  `activeSessions` without an error; a cancelled turn counts too, the stream has no cancel signal)
  and after a new look, as a card pinned under the header (the message list is a UICollectionView,
  so nothing can be placed under the last message); the sign-in and spent-allowance moments were
  already there.

## Building on a Mac

Requirements are upstream's, in [android/BUILDING.md](../android/BUILDING.md): a recent Xcode
(the project is on the iOS 26 SDK), Homebrew `ninja meson llvm lld libarchive pkg-config`, Go 1.25
for rclone.

```bash
git clone --recurse-submodules https://github.com/nano-muse/nanoMuse.git && cd nanoMuse/android
./deps/build_lame.sh && ./deps/build_ffmpeg.sh          # FFmpeg links against LAME: this order
./deps/build_ish.sh && ./deps/prepare_alpine_rootfs.sh  # the sandbox kernel and its rootfs
./deps/build_rclone_ios.sh                              # Rclone.xcframework
cp src/ios/Configs/ProviderCustomization.xcconfig.example src/ios/Configs/ProviderCustomization.xcconfig
open src/ios/Minis.xcodeproj
```

Pick the **Minis** scheme, set your team under *Signing & Capabilities* (the project ships with an
empty `DEVELOPMENT_TEAM`), build for a device: the native libraries are device-only, so the
simulator does not link — see the troubleshooting section of BUILDING.md.

## TestFlight

Distribution is TestFlight, **internal testers**: the people you add as users of your App Store
Connect team (up to 100), who get every build minutes after it is processed, with no App Review.
An external group (public link, up to 10,000 testers) needs Apple's beta review once per version
— that is the step we are not waiting for; it can be switched on later in App Store Connect without
touching the pipeline.

### Where it stands

Set up on 2026-10-03, all of it under the account holder's developer account (team
`TN43QYW8K4`), nothing of which is in the repository:

- the app record *nanoMuse*, iOS, bundle id `io.github.nanomuse.app`, SKU `nanomuse-ios`,
  Apple ID `6818802049`; the three extension bundle ids `…app.ShareExtension`,
  `…app.FileProvider`, `…app.AgentWidget`; the app group `group.io.github.nanomuse.app` and the
  iCloud container `iCloud.io.github.nanomuse.app`; the capabilities the four `.entitlements`
  ask for (App Groups, HealthKit with clinical records, HomeKit, iCloud/CloudKit, NFC tag
  reading, WeatherKit) turned on on the identifiers;
- the API key *nanoMuse CI* (role App Manager), the Apple Distribution certificate
  *Apple Distribution: Guangyi Liu* (valid to 2027-10-03) and the four App Store profiles
  *nanoMuse App Store*, *nanoMuse ShareExtension App Store*, *nanoMuse FileProvider App Store*,
  *nanoMuse AgentWidget App Store*;
- the six repository secrets of the table below;
- the internal TestFlight group *nanoMuse Core* with automatic distribution, so every processed
  build reaches its testers by itself; the device list is empty on purpose (nothing here needs
  one);
- **the first build**: 0.1.31 (2), archived and uploaded by the workflow on 2026-10-03, processed
  by App Store Connect (`VALID`, export compliance answered by the Info.plist key) and in beta
  testing with the internal group — the first thing that can be installed from TestFlight;
- the test information an external group needs, in English and Simplified Chinese: the beta app
  description, the feedback address, the marketing and privacy-policy links, and *What to Test*
  on build 2 (none of it names other products); and the external group *nanoMuse Beta*, created
  **without** a public link and without a build;
- not done: the beta-review contact (name, phone) and the demo-account decision in *Beta App
  Review Information*, which are the account holder's to fill, then adding build 2 to the external
  group — that is the step that submits it to Apple's beta review; a public link once the review
  has passed; and anything towards the App Store (the app is not going there). The app has not
  run on a physical iPhone from the maintainers' side yet: the smoke test is the internal
  testers' first job.

### Once, in App Store Connect

1. **The app record.** *Apps → + → New App*: platform iOS, name nanoMuse, bundle id
   `io.github.nanomuse.app`, a SKU. Automatic signing registers identifiers, but the app record
   itself is created once, by hand. If the bundle id is not offered in the list, register it first
   under *Certificates, Identifiers & Profiles → Identifiers*.
2. **Capabilities on the identifier.** The entitlements ask for App Groups, iCloud (CloudKit),
   HealthKit (with clinical records), HomeKit, NFC tag reading and WeatherKit. Automatic signing
   turns most of these on by itself; if the first archive fails on a capability, enable it on the
   identifier by hand, and create the iCloud container `iCloud.io.github.nanomuse.app` and the
   app group `group.io.github.nanomuse.app` there. WeatherKit also has to be enabled on the
   *Services* tab of the identifier.
3. **An API key.** *Users and Access → Integrations → App Store Connect API → Team Keys → +*,
   role **App Manager** (Developer is not enough to upload). Download the `.p8` once; note the
   Key ID and the Issuer ID shown above the table.
4. **Testers.** *TestFlight → Internal Testing → +*: a group, and the team members in it.

### Repository secrets

| Secret | What |
|---|---|
| `APP_STORE_CONNECT_KEY_ID` | The key's ID, 10 characters |
| `APP_STORE_CONNECT_ISSUER_ID` | The issuer ID, a UUID |
| `APP_STORE_CONNECT_KEY_P8` | The full text of `AuthKey_<ID>.p8`, `-----BEGIN PRIVATE KEY-----` to the end |
| `APPLE_TEAM_ID` | The 10-character team id (*Membership details* in the developer account) |
| `IOS_DIST_P12_BASE64` | The team's *Apple Distribution* certificate with its private key, a `.p12`, base64 in one line |
| `IOS_DIST_P12_PASSWORD` | That `.p12`'s password |

### The certificate, and why signing is manual

Xcode's automatic signing (`-allowProvisioningUpdates` with the key) was the first plan and does
not work for a team like this one: an archive is signed with an *iOS App Development* profile
before the export re-signs it for the store, and a development profile has to list at least one
device — a team that only ships through TestFlight has registered none, so the archive stops at
*Your team has no devices from which to generate a provisioning profile*. The lane therefore
signs manually with the store's own material, which needs no devices: the Apple Distribution
certificate from the two secrets above, and the four *App Store* provisioning profiles (the app
and its three extensions) that `get_provisioning_profile` downloads from the account with the key
at the start of every run — and repairs there if the certificate they name is not the one in the
keychain.

The certificate was made without a Mac, and can be made again the same way when it expires or
the key is lost (a team may hold two or three distribution certificates; revoke the old one in
*Certificates, Identifiers & Profiles → Certificates* first if the limit is reached):

```sh
umask 077 && cd ~/.private/apple/dist                                # anywhere outside the repository
openssl genrsa -out dist.key 2048
openssl req -new -key dist.key -out dist.csr -subj "/emailAddress=<account e-mail>/CN=nanoMuse CI distribution/C=CN"
# POST /v1/certificates { certificateType: DISTRIBUTION, csrContent: <dist.csr> } with a JWT signed
# by the API key (the key's role must be App Manager or Admin); save certificateContent, base64, as dist.cer
openssl x509 -inform DER -in dist.cer -out dist.pem
openssl rand -base64 24 | tr -d '\n' > dist.p12.pass
openssl pkcs12 -export -inkey dist.key -in dist.pem -out dist.p12 -passout file:dist.p12.pass   # with OpenSSL 3 add -legacy
base64 -w0 dist.p12 | gh secret set IOS_DIST_P12_BASE64 -R nano-muse/nanoMuse
gh secret set IOS_DIST_P12_PASSWORD -R nano-muse/nanoMuse < dist.p12.pass
```

The private key stays in that folder on the maintainer's machine (and in the secret); nothing
of it goes into the repository, a log or a chat. The profiles were created once in the account
with the same API (`POST /v1/profiles`, type `IOS_APP_STORE`, one per bundle id, each naming the
certificate); the lane makes them again if they are missing.

### Does it compile?

*Actions → iOS · build check → Run workflow* (`.github/workflows/ios-check.yml`) builds the app
for a device on a Mac runner with signing turned off — no Apple account, no secrets. It shares
the native-dependency cache with the TestFlight workflow, so run it first: a compile error costs
minutes there, not an upload. The full `xcodebuild` log is attached to the run.

### Running it

*Actions → iOS · TestFlight → Run workflow*, or push a tag `ios-<anything>`. The job builds the
native dependencies (cached on the scripts and the iSH revision; the first run takes about an
hour, later ones a few minutes plus the archive), archives with `fastlane beta`
(`android/src/ios/fastlane/Fastfile`), uploads, and attaches the `.ipa` and the dSYMs to the run.
The build number is the workflow run number, so every upload is newer than the last; the version
is `MARKETING_VERSION` from the project. `ITSAppUsesNonExemptEncryption` is already `false` in the
Info.plist, so builds do not wait for the export-compliance question.

The runner is `macos-26`; if the label is not available on your GitHub plan, `macos-15` with
`xcode-version: latest-stable` is the fallback, at the cost of the iOS 26 SDK the project asks for.

## What follows

The Android app is where nanoMuse's shape lives; the iOS app is OpenMinis with our name, plus
the Cloud sign-in. In the order it makes sense to port, and where the Android code is:

| Android (`io.github.nanomuse.*`) | On iOS |
|---|---|
| `cloud` — relay client, sign-in, account | Done: `NanoMuse/NanoMuseCloud*.swift`, `NanoMuseAccount*.swift` (0.1.32: password, invite code, the allowance in yuan, usage, sessions, timeline, delete) |
| `ui.onboarding` — the four-page first run with *Sign in — free* | 0.1.32: a *Sign in to nanoMuse Cloud — free* entry on the start screen (`NanoMuseWelcome.swift`); the four pages come with the shell |
| `community.StarPrompt` — the star asks | 0.1.32: at sign-in and when the allowance is spent (`NanoMuseStar`); after the first task with the shell |
| `nm.show_steps` — the agent's steps off by default | 0.1.32: `NanoMuseSteps.swift`; finished messages keep to the conversation, a running one shows its steps |
| `connectors` — the catalogue | Next, after the Android flow is confirmed on a device ([parity.md](parity.md)) |
| `ui.home`, `ui.chat`, `ui.settings` — the Muse-style shell, header, tones | SwiftUI views under `NanoMuse/`; the OpenMinis screens stay behind them |
| `avatar` — the drawn face and its states | Needs the relay's picture model; same request shape as Android (`docs/cloud.md`) |
| `reach` — the phone drives the computer | The pairing protocol is platform-neutral; the client moves as is |
| `hands` — the phone's own screen | No equivalent: iOS does not let an app drive another. App Intents / Shortcuts are the door there |
| Widgets, notifications, background tasks | Upstream's `AgentWidget` and BGTasks already cover most of it |

Not in the plan: App Review. TestFlight internal is the distribution until the shell is ported and
the store listing can be honest about what the iPhone app is.
