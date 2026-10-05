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
  Any build can point at another relay (*Use a different server*, below). Since 0.1.32 the page is the whole account — the
  password as the other way in, a friend's invite code, the pool in yuan with the ways on when it
  runs low (your own key, an invitation, a star once), usage by kind and by model, the devices
  holding a key, the timeline, deletion — the same sections as the phone's `CloudAccountScreen`.
- **The agent's steps, the status line.** *Settings → Chat → Steps* keeps the tool capsules out of
  finished messages unless asked for; the typing line reads *〈name〉 is on it*, not *is thinking*.
  Both are one-line edits in upstream's `AssistantBlockView` / `ContentView`, marked `// nanoMuse:`.
- **The Muse shell (0.1.33; iPad too since 0.1.34).** `NanoMuseRoot` replaces upstream's
  `ContentView` at the root; *Settings → nanoMuse* has the two switches (*Muse home*, *Face and
  name in the chat header*), and the OpenMinis layout stays one tap away in the drawer. The chat's
  navigation title becomes **face · name · status line** (`NanoMuseHeader.swift`): the status
  reads *waiting for you* while a question or an approval is up, then the running tool's
  `tool_title` — the model's own words for the step, *打开携程网站* — then *writing the reply*,
  then *On it: 〈brief〉*, and the model's name when idle; while a new face is being drawn it
  reads the avatar flow's line. The face (`NanoMuseFaces.swift`, the drawn face from Application
  Support or the dragon from the bundle, five moods with the breath, bob, tilt, pop and shake of
  the other clients) is tapped into **the agent's page**. The drawer holds the sessions, search,
  a new side chat, *Pin as the main chat*, *All chats* and the nanoMuse settings.
- **The agent's page (0.1.34)** (`NanoMuseAgentPage.swift`, Android `ui/profile`): the big face
  with the pen badge (*Change avatar* puts "Change your avatar to " in the main chat's composer,
  *Edit name*, *Avatar studio*), the name, *online*, and four panes — **Activity** (what you asked
  and what the agent did, from the last two days of sessions), **Approvals** (the standing
  "always allow" answers, revocable), **Daily** (the routines and the goal check-ins with their
  next run, *Manage routines*), **Soul & memory** (SOUL.md and GLOBAL.md, editable) — and the
  share sheet (`NanoMuseAvatarShareSheet`, Android `ui/avatar/AvatarShareSheet.kt`).
- **The avatar, from the chat (0.1.34)** (`NanoMuseAvatarFlow.swift`, Android `avatar/AvatarFlow.kt`):
  "换成一只橘猫" / "change your avatar to a red panda" is read before the model sees it (the same
  regexes, tested in `MinisTests/NanoMuseLogicTests.swift`); four candidates come up as a card in
  the chat, picked by tap or by words (*the second one*, *第三个*, *regenerate*); then *Finalizing
  poses…*, the new face on, the profile pushed, a line in the memory, the share card. Through the
  relay with a cost card first (`/v1/estimate`), or through the person's own Bailian key
  (`NanoMuseImageGen.swift`, DashScope's native image endpoint) when the phone has one; the studio
  (`NanoMuseAvatarStudio.swift`) uses the same path and lets the image model be picked.
- **The scheduler (0.1.34)** (`NanoMuseScheduler.swift`): routines — a label, a prompt, a time,
  daily / weekdays / once or every N hours — run as a headless turn in a conversation of their own
  (`NanoMuseHeadless`). Honestly: the iPhone runs them when the app is open (every due one on
  becoming active), asks iOS for a `BGAppRefreshTask` (`io.github.nanomuse.app.scheduler`) when
  it goes to the background and runs what is due if iOS grants it, and posts a local notification
  at each due time (*Check-in: 〈goal〉 — open to run it*) whose tap opens the conversation. Every
  piece of copy about routines says so. *Settings → nanoMuse → Scheduled tasks* lists them all,
  the goal check-ins and the feed's included.
- **Goals (0.1.34)** (`NanoMuseGoals.swift`, Android `goals/`): *Create a goal › category* sends
  the opener to the main chat with a system addendum for a few turns; the model's
  ` ```nanomuse-goal ` block becomes the goal and its check-in routine, ` ```nanomuse-goal-update `
  blocks move the progress; cards in the chat (*Goal created*, *Goal update*), the Goals room
  with progress, steps, pause / check now / done / delete, and the routines beneath.
- **Feed (0.1.34)** (`NanoMuseFeed.swift`, Android `feed/`): a daily routine writes a few short
  posts from the memory, the diary and the goals into `feed/<day>/<n>.md` with front matter; the
  ` ```nanomuse-feed ` fence is how the model hands them over. The Feed room shows them by day,
  *Discuss* opens a side chat on the post, the sliders hold what the feed is about, the time, the
  switch and *Write it now*. **Ideas** gained *Create routine* (scheduled at the idea's time, the
  editor opens) and *Start goal* beside *Send to chat*.
- **First run and settings (0.1.34)** (`NanoMuseFirstRun.swift`, `NanoMuseSettings.swift`,
  `NanoMuseCoding.swift`, `NanoMuseSystemFiles.swift`): the four pages of the Android first run
  (welcome → sign in — free → a password once for a fresh account → which model answers → meet
  〈name〉), with *I have my own API key* opening the own-key sheet (Bailian / OpenRouter, ordered by
  region; OpenRouter's sign-in without a paste), and the first conversation afterwards (the
  opening lines, "what should I call you?", the name chooser from the model's ` ```nanomuse-naming `
  block, GLOBAL.md and SOUL.md written). *Settings → nanoMuse*: the account, **Coding agents**
  (Cursor / Codex / Claude Code sessions on the computers of the account over the hub's
  `coding.*` actions, a message to any of them), **Scheduled tasks**, **System files** (SOUL,
  GLOBAL, the diary, the feed's instruction, the routines' schedule, *Import memory* from another
  assistant), Connectors, Data controls, the two shell switches, *Show the welcome again*.
- **Models (0.1.34)** (`NanoMuseModels.swift`): the relay's menu opens on `deepseek-v4.1-flash`
  (the one marked recommended *for chat*; `qwen3.8-27b` is the hands' model and never the chat
  default); a pick made in the chat's picker moves to the front of the Cloud group so new chats
  follow it, as Android's `followPick`. DeepSeek ids are text-only unless they name `v4.1` or
  later, `vision` or `ocr` — a `// nanoMuse:` step at the top of `LLMModel.withInferredModality()`.
- **Connections across devices (0.1.34)** (`NanoMuseSharedConnectors` in
  `NanoMuseConnectors.swift`): the profile's `connectors` list says which device connected what
  (id, label, address without the query string, how it signs in, enabled, when, the device) and
  never a token; this phone puts its own entries, reads the others' back, and the Connectors page
  lists them under *On your other devices* — *Connected on 〈device〉 — sign in here to use it on
  this phone*. The ways-on card in the account follows the region: Bailian first in mainland
  China, *Sign in with OpenRouter* first elsewhere.
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
- **The phone's chrome (0.1.35)** (`NanoMuseChrome.swift`, `NanoMuseAppearance.swift`, Android
  `ui/chat/MuseHeader.kt` and `ui/settings`): the Muse header — the face disc, the name pill with
  the live status line under it, round drawer and ••• buttons — on the chat and on Feed, Ideas,
  Goals and Library; the side drawer after Android's; the agent's grey bubble for its replies
  (`NanoMuseAssistantBubble` in `NanoMuseChatCards.swift`); the agent page's toolbar as round
  buttons; *Settings → nanoMuse* rebuilt as Muse cards in the Android order
  (`NanoMuseSettingsHomeView`: Image & video models, Avatar, Computers, Appearance — avatar size,
  the model under the name, the steps, the theme — Notifications, Account, Coding, Scheduled
  tasks, Shared folders, Chat files, System files, Version). A `nmOnChange` helper keeps
  `onChange` on iOS 16, the app's deployment target.
- **Motion clips (0.1.35)** (`NanoMuseVideoGen.swift`, `NanoMuseAvatarMotion.swift`,
  `NanoMuseMediaModels.swift`; Android `avatar/VideoGen.kt`, `avatar/AvatarMotion.kt`): a drawn
  face gets four 4-second clips — idle, working, waiting, happy — from `wan2.2-i2v-flash`
  (DashScope's async API through the relay, or your own Bailian key), the phone's prompts word
  for word, kept per device under `avatar/motion/`; the face plays them with an `AVQueuePlayer`
  and an `AVPlayerLooper` (suspended in the background), the dragon's clips come from the bundle.
  *Image & video models* lists the models, *Animate the avatar after a change* (on by default)
  and *Make / Redo clips*; the studio's cost estimate counts the clips.
- **Version, star asks, the feed's first day (0.1.35)** (`NanoMuseUpdateCheck.swift`,
  `NanoMuseNudges.swift`): the Version row shows the installed build and the latest release
  (`nanomuse.cn/dl/index.json` first, GitHub second, a day's cache — *Latest 0.1.x — you have it*
  / *0.1.x is out* / *Could not check — tap to try again*). The star asks follow the relay's
  policy (`/v1/nudges`, `nudges` in `/v1/me`, the same defaults built in): never in the first
  conversation, then the 3rd / 10th / 30th task (`NanoMuseStarWatch`: a person-started session
  leaving `activeSessions` without an error), the 7th / 30th day, a goal reached, a new look,
  sign-in, the allowance spent — seven days apart, four per phone — as a card pinned under the
  header (the message list is a UICollectionView, so nothing can be placed under the last
  message). The Feed opens on the intro card, says when the daily routine runs while it is
  empty, and writes its first day after the first conversation; a Notifications page joined the
  first run.
- **The composer (0.1.38)** (`NanoMuseComposerField.swift`, `NanoMuseComposerWatch.swift`, the
  `// nanoMuse:` lines in `Views/Chat/AIChatView.swift`): the pill's field is SwiftUI's own
  `TextField(axis: .vertical)` with `@FocusState` and `lineLimit(1...6)`, not upstream's
  `UIViewRepresentable` text view. The reason is the 0.1.36 and 0.1.37 reports of a chat with
  only the tab bar at the bottom — right after the first conversation's naming on the
  maintainer's iPhone: the overlay that holds the composer was a UIKit host (because of the
  representable inside it), and iOS left that host standing with no subviews when the naming
  card left the same stack as the turn ended; nothing SwiftUI owned changed, so nothing redrew,
  and the 0.1.37 watchdog dropped the check that fell inside its cooldown. The watchdog stays
  as the last net and now re-schedules a check it cannot run yet; a second after the chat
  appears, a message goes out or a turn ends, the composer must have reported a height, or the
  **fail-safe** hosts the same stack as a bottom safe-area inset (`NanoMuseComposerWatch.failSafe`),
  which is a different host from the overlay's. What the representable did and the native field
  does not: an image pasted straight into the field (the plus menu has *Paste image* when the
  pasteboard holds one), the select-and-replace capture for the correction learner, the exact
  caret for the `@` menu (now the end of the text), swipe-to-send on texts estimated longer than
  six lines, and hardware arrow / Tab navigation of the popups on iOS 16 (iOS 17+ has them via
  `onKeyPress`). Return on a hardware keyboard sends, Shift+Return breaks the line, the on-screen
  Return follows *Settings → Appearance → Return sends*; dictation still ends in *Back to typing*.
- **The launch screen (0.1.38)** (`NanoMuse/NanoMuseLaunch.storyboard`,
  `NanoMuse/NanoMuseLaunch.xcassets`): the mark on the system background, no words, light and
  dark. Upstream's storyboard stays in the tree; `scripts/rebrand.py` points
  `INFOPLIST_KEY_UILaunchStoryboardName` at ours. iOS caches launch screens per install: after
  an update the old one can show a few more times, a reinstall shows the new one at once.
- **Side chats and presence (0.1.38, Contract C9)** (`NanoMuseSync.swift`, `NanoMusePresence.swift`,
  `NanoMuseSyncSettings.swift`, `NanoMuseFromDeviceCaption.swift`): *Data controls → Also sync
  side chats* is per device and off by default — only the main conversation goes up and the pull
  asks `scope=main`; side rows that still arrive are ignored. Turning it on pulls once from
  `since=0&scope=all&tail=300` (idempotent by `mid`) and the side chats go up with the next push;
  turning it off narrows the traffic again and deletes nothing. A table's first pull is
  `since=0&tail=300`: the newest 300 texts, not the whole history. Presence: `POST
  /v1/sync/working {cid, working}` after the user line is pushed and after the turn's end is;
  the hub's `working` frame and `/v1/sync/state`'s `working` list fill a map that expires after
  ten minutes, and the chat shows *〈device〉 is working…* under the last message when it is
  another device's user line (`ChatMessage.nmWorkingDevice`). A remote user line as the tail is
  never this phone's interrupted turn: `recheckCanResumeFromHistory` leaves `canResume` off for
  it, so no banner, no Resume, nothing re-sent.
- **Sign-in and the relay (0.1.38)** (`NanoMuseCloud.swift`, `NanoMuseCloudView.swift`,
  `NanoMuseRelayPicker.swift`): a phone number with a country code other than +86 is told
  *Text-message codes reach mainland-China numbers only. Use an e-mail address instead.* before
  the code is requested, and the relay's `phone_region` error reads the same. *Use a different
  server* on the sign-in page opens a sheet: the address, *Check* (`GET /healthz`), *Use this
  server*; https is required unless the host is on one's own network (`10.`, `192.168.`,
  `172.16–31.`, `localhost`, `*.local`, `*.ts.net`). Signed in, the account page shows *Server:
  〈host〉* with *Change*, which signs this phone out first — a key belongs to the relay that
  issued it.
- **One account's conversations, not the last person's (0.1.39, Contract C10)**
  (`NanoMuseSync.swift`, `NanoMuseShell.swift`): a conversation belongs to the account that first
  pushed or pulled it — the sync table that maps it is that account's, and every account that has
  synced on the phone keeps its table (`nanomuse-sync-accounts.json`, keyed by the relay's opaque
  `account.id`, never the phone number or e-mail). Signed in, the chat lists and the Chat tab show
  the account's own conversations and the ones no account has synced yet; another account's stay
  on the phone, hidden, and are never pushed under the signed-in account — an unowned one becomes
  the account's with its first push. Signing in as a different account than last time starts
  that account's cursor over (the `tail=300` pull) and forgets presence; signing back in as the
  first account brings its conversations and its main chat back. Signed out, everything on the
  phone shows and nothing moves. The agent's name and look already follow the account; the local
  memory files do not yet.

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

The Android app is where nanoMuse's shape lives; since 0.1.34 the iPhone carries the same shape
over OpenMinis — the agent's page, the chat-driven avatar, goals, feed, routines, the first run —
with iOS's limits on background work spelled out in the copy. Where the Android code is, and
what became of it here:

| Android (`io.github.nanomuse.*`) | On iOS |
|---|---|
| `cloud` — relay client, sign-in, account | Done: `NanoMuse/NanoMuseCloud*.swift`, `NanoMuseAccount*.swift` (0.1.32: password, invite code, the allowance in yuan, usage, sessions, timeline, delete) |
| `ui.onboarding` — the first run with *Sign in — free* | Done (0.1.34): `NanoMuseFirstRun.swift`, the first conversation included; 0.1.35 the Notifications page; no Hands page on iOS |
| `community.StarPrompt`, `community.Nudges` — the star asks from the relay's policy | Done (0.1.35): `NanoMuseNudges.swift`, `NanoMuseStar` — the moments, the cooldown and the cap from `/v1/nudges` |
| `community.UpdateCheck`, the Version row | Done (0.1.35): `NanoMuseUpdateCheck.swift` — installed and latest, `nanomuse.cn/dl/index.json` then GitHub |
| `avatar.VideoGen`, `avatar.AvatarMotion` — the motion clips | Done (0.1.35): `NanoMuseVideoGen.swift`, `NanoMuseAvatarMotion.swift`, `NanoMuseMediaModels.swift` |
| `nm.show_steps` — the agent's steps off by default | 0.1.32: `NanoMuseSteps.swift`; finished messages keep to the conversation, a running one shows its steps |
| `connectors` — the catalogue, `SharedConnectors` | Done: `NanoMuseConnectors.swift` (0.1.33 the catalogue, 0.1.34 the other devices' entries) |
| `ui.home`, `ui.chat`, `ui.settings`, `ui.profile` — the shell, header, agent page | Done: `NanoMuseShell.swift`, `NanoMuseHeader.swift`, `NanoMuseAgentPage.swift`, `NanoMuseSettings.swift`; 0.1.35 the Muse header on every room, the settings as Muse cards (`NanoMuseChrome.swift`, `NanoMuseAppearance.swift`) |
| `avatar` — the drawn face, the chat-driven change, the studio | Done (0.1.34): `NanoMuseAvatarFlow.swift`, `NanoMuseAvatarStudio.swift`, `NanoMuseImageGen.swift` |
| `goals`, `feed`, the scheduler | Done (0.1.34) as far as iOS allows: foreground catch-up, `BGAppRefreshTask`, local notifications. No alarm-exact runs while the app is asleep — the copy says so |
| `coding` — the computers' coding agents over the hub | Done (0.1.34): `NanoMuseCoding.swift`; the computer must run nanoMuse signed in with the same account |
| `reach` — the phone drives the computer | Done: `NanoMuseReach.swift` over the hub |
| `hands` — the phone's own screen | No equivalent: iOS does not let an app drive another. App Intents / Shortcuts are the door there |
| Widgets | Upstream's `AgentWidget` as it is |

Still to check on a device, in order: the first run end to end with a fresh account; a chat-driven
avatar change through the relay and through a Bailian key, and the four clips it draws afterwards; a routine coming due with the app in
the background (does iOS grant the refresh on the tester's phone, and how often); a coding session
against a computer of the account; the connectors list after a second device signs in.

Not in the plan: App Review. TestFlight internal is the distribution until the shell is ported and
the store listing can be honest about what the iPhone app is.
