# The desktop, the way Muse does it

> What Meta's Muse desktop app looks like and does, written down from using it, and what
> the nanoMuse desktop on DeepSeek Harness takes from it, leaves out, or does its own
> way. Interface only: no account, no conversation, no screen content from the session
> this was taken from. Muse is Meta's trademark; nanoMuse is a community project with no
> affiliation — see [the README](../README.md#disclaimer).

The desktop app here is **DeepSeek Harness plus the `dsh-nanomuse` bundle**
([harness.md](harness.md)). dsh brings the loop, the tools and a complete web app with
seats a plugin can take; the bundle takes the seats that make the window look and
behave like Muse, hides what Muse does not have, and adds what the phone app has that
Muse does not — the account on every device, Reach, an open model layer.

## The window

**Muse.** One window. A narrow icon rail on the far left, a column of chats next to it,
the conversation in the middle. The agent's face and name sit *above* the conversation,
centred, with a one-line status under the name that changes as it works ("thinking",
"looking at the screen", "generating options"). The composer at the bottom has an
attach button and a microphone; while the agent works the send button becomes a stop
square. Light, dark and system themes, an accent colour, system typography; nothing
decorative, every surface a flat tone one step from its neighbour.

**nanoMuse on dsh.** The same window, screen for screen, from dsh's `sidebar` seat and a
stylesheet over the harness's stable DOM hooks (`data-composer-card`,
`data-chat-flow-kind`, `data-approval-key`…):

- The rail, in Muse's order: Chats (a dot while the agent works), Search, Devices, then
  the harness's Schedules when its plugin is installed; a spacer; the hamburger at the
  foot. No face on the rail — as in Muse, the face is the pinned header and the profile
  panel. On macOS the window has no title bar: the traffic lights sit over the rail's
  empty top, which is a drag handle, and full screen takes the clearance away.
- The chats column: a *Search* field with a *···* menu (archived chats), **Main chat**
  — one session that stays at the top, the first one or the one you chose with *Make
  main chat* — and **Side chats** with a *+*: every other session, pinned first, each
  with a *···* for *Make main chat*, *Pin*, *Rename* (inline), *Archive*. A blank
  session reads *New chat*; a dot marks a running one, a mark one that waits for you.
  It collapses to the rail alone.
- Above the conversation, in the harness's `conversation.header.leading` seat, the face
  and name are pinned at the top centre with the status chip: *connected* / *not signed
  in* / *thinking…* / *Hands · step N · what it is doing* / *Reach · step N · on Laptop
  B: …* / *waiting for you*; a *Stop* button beside it while a turn runs. The chip tints
  while the agent works and while it waits for an answer. Clicking the face opens the
  profile panel. At the top right, *Invite* (with an account), then the harness's
  right-sidebar toggle; the harness's own title row, tabs (*Conversation* / *Trace*)
  and session actions are hidden — the chat rows carry rename, pin and archive.
- The conversation: your messages in bubbles toned from the accent on the right, the
  agent's in large-radius grey bubbles on the left, timestamps and the per-message
  actions on hover only; an empty chat has no greeting — the composer waits at the
  bottom, as in Muse, with the workspace and preset row above it.
- The composer is one pill: *+* (attach), *Message*, the send disc (the stop square
  while a turn runs). The harness's model picker, permission mode and plan toggle are
  hidden from it — the model lives in Settings → Models and the default permission mode
  in General, as in Muse — and come back with *Show DeepSeek Harness controls* under
  General. No microphone: dsh's web profile has no dictation.
- Theme: the harness's light and dark palettes are overridden to Muse's tones (`#f9f9f9`
  surfaces, `#e3e4e6` agent bubbles in the light; `#171717` with `#242424` bubbles and
  `#2b2b2b` fields in the dark) and the accent follows the face's colour on the account,
  so a face coloured on the phone colours the desktop too. The desktop shell paints the
  window in the same base colour, so a resize never flashes white in the dark.

## The first run

**Muse.** Sign in (a phone number, an SMS code — "sign in or create an account"), a
loading page, then a carousel asking to allow the agent to use the computer: one card
per permission (accessibility for clicking and typing; screen recording for
screenshots), each with an *Allow* button, fine print, *Skip*.

**nanoMuse on dsh.** The same sheets, full-window, in the harness's `settings.onboarding`
seat (we take the shipped step's id, so a fresh install meets the agent instead of being
asked for a DeepSeek key):

1. **Welcome** — the face, *Welcome to nanoMuse*, one blue *Sign in* pill; under it, in
   small type, *Use my own API key* (opens Models) · *Later*.
2. **Sign in or create an account** — one field, *Phone number or e-mail*, the fine print
   with the terms and the privacy policy, *Continue*; the same two calls the phone uses
   (`/v1/auth/code`, `/v1/auth/verify`).
3. **Enter your code** — *A code was sent to …* with *Resend*, six code boxes that verify
   themselves on the sixth digit, *Next*, *Try another way* (a password, for accounts
   that set one: `/v1/auth/login`).
4. A spinner while the account is adopted (models, name, face), then the **permissions
   carousel**, ‹ › top right, *Continue* and *Skip* on each: **Allow nanoMuse to use
   your computer?** on macOS only — *Accessibility* and *Screen recording* rows, each
   with *Allow* that asks the system through the desktop shell and turns into a green
   check as the system grants it (polled, and again when the window gets focus; the
   shell can open the System Settings pane); **Allow nanoMuse to access your files?** —
   the workspace folder, *Change* opens the native folder picker and creates the
   workspace; **Your other devices** — this computer, the devices on the account that
   are online, *Open* for the phone app otherwise.
5. **nanoMuse is ready** — the face, a beat, and the window fades in.

The step completes itself when a model can already answer (the account, a key, a
provider the person added) and does not show again. In a plain browser (dsh without the
shell) the computer card is left out: there is no bridge to the system there, and Hands
on Linux and Windows need no permission.

## The profile and the face

**Muse.** The face at the top opens a profile panel on the right: a large avatar with a
pen (*change avatar* / *edit name*), tabs for the profile, the approval log (what was
allowed, when, "allowed for this task" / "always allowed"), activity, more. A new face
is drawn in the chat: four candidates in a grid, pick one, the agent confirms in words.

**nanoMuse on dsh.** The face at the top opens the same panel, 310 px on the right,
beside the chat (the chat makes room; × or Escape closes it): the avatar at 86 px with a
pen — *Change look* (the dragon, or an emoji on a colour, written to the account and
worn on every device) and *Edit name* — the name, *Connected* / *Not signed in* /
*Offline*, and a segmented control of four tabs: **Activity** (the sessions and the
hub's notices, *Today* and *Earlier*), **Approvals** (what you allowed or rejected on
the approval cards, with when; kept on this computer), **Schedule** (opens the harness's
schedules panel), **Memory** (what the account carries from device to device and the
agent's description). Drawing a face from four candidates is the phone's studio; the
desktop wears what the account has.

## Computer use

**Muse.** The controlled screen is shown inside the window as a dimmed live stage: an ×
to stop top-left, take-over controls top-right, a caption bottom-left saying what was
just done ("typed · <app>", "pressed ↵ · <app>"), the face as the cursor marker. Inline
permission cards in the chat — *allow <name> to take a screenshot?* / *write a file?* —
with *Allow (this task)*, *Always allow*, *Deny*.

**nanoMuse on dsh.** Hands are the runtime's `computer_screen` / `computer_act` over
MCP, so what the model sees is the screenshot it asked for and the status chip says
*Hands · step N · click "Save"* while it works. The harness's approval card is restyled
into Muse's permission card — a shield, the headline, the detail, *Allow once* in blue
first and *Reject* in grey — and every answer is written to the profile panel's
*Approvals* tab; the Sentinel's reasons ([sentinel.md](sentinel.md)) are in the
headline. dsh decides *once* or *rejected*; the standing answer is its permission mode
(General → the default for new chats). Settings → **Computer use** shows the two macOS
permissions with *Allow* and *Open System Settings* (through the desktop shell), *Keep
the screen awake while it works* (the shell holds a power-save blocker while a session
runs) and the note that anything that sends, pays or deletes is asked first. The live
stage — the controlled screen inside the window — is not built: on the desktop the
controlled screen *is* the screen. What the phone app shows while its Hands work
([gui.md](gui.md)) is the model.

## Settings

**Muse.** A dialog with a sidebar: General (account, usage, language, appearance with
mode and accent, run on startup, show in menu bar, floating button, shortcuts, About
with version and check for updates) · Connectors · Computer use (the two macOS
permissions, keep screen awake, ask every time / always allow / always deny for computer
control and browser automation, blocked apps) · File system access · Dictation · Wallet
· Secure storage · Permissions · Message channels · Devices · Data controls (privacy,
import memory, download your data, reset) · Help · Legal · Sign out.

**nanoMuse on dsh.** The same shape, from the harness's `sidebar.settings` seat with its
stock General plugin switched off in the bundle layer:

- **General** — the harness's own rows (permission presets, language, appearance, font
  size, shortcuts, developer tools…) mount in our page through the `settings.general.item`
  seat, then *About*: nanoMuse, built on DeepSeek Harness, the bundle's version, the
  licence; and *Developer*: *Show DeepSeek Harness controls* (the model picker, the
  modes, the workspace browser in place of the chats column).
- **Account** — the nanoMuse account: sign in or the masked identifier, the allowance,
  the look, the models, *Open Devices*.
- **Models**, **Agents** — the harness's pages, unchanged.
- **Computer use** — the system permissions (macOS), keep awake, the risk note.
- **Devices** — this computer (its name, the remote-control switch that lets the phone
  run things here) and the other devices on the account, online dots, *Forget*.
- **Data controls** — *We take your privacy seriously* with the privacy policy, *Help
  improve nanoMuse's AI models* (the relay's switch, with how many turns it kept and
  *Delete*), as on every other app.
- **Help & support** — the docs, the site, discussions, report an issue, the version.
- **Legal** — the licence, the Meta trademark notice, the acknowledgements (DeepSeek
  Harness, OpenMinis), the privacy policy and the terms.
- **Advanced** — every page another plugin registers (the harness's plugin manager,
  archived sessions…), grouped at the bottom so they are there and out of the way.
- **Sign out** at the foot while signed in.

Connectors, dictation, wallet, secure storage and message channels are not there: dsh's
web profile has no equivalent, and the Cloud has no wallet — members have an allowance
([cloud.md](cloud.md#allowance)).

## The rail's other rooms — Feed, Ideas, Goals, Library

**Muse.** Four more rooms on the rail: a *Feed* of posts the agent makes (digests with
pictures, like / discuss, a text that steers future posts); *Ideas*, proactive
suggestions by life area, each a card with why, what it includes, how it works, *start
now*; *Goals* with categories, running automations (cron-like) and a dated timeline;
*Library*, everything generated — documents (a markdown editor), web artefacts, images,
videos, podcasts, system files.

**nanoMuse on dsh.** Deliberately not copied as rooms. What they do lives in the chat
and the harness's own parts: the schedule plugin covers the automations (its panel
appears on the rail when installed), documents are files in the workspace, and the
phone app's Ideas and Library screens ([every-device.md](every-device.md)) stay on the
phone. If a room earns its place later it is one `main` panel and one rail button away.

## The hamburger

**Muse.** Settings; report a bug (with a screenshot attached).

**nanoMuse on dsh.** Settings (with its shortcut), Keyboard shortcuts, the harness's
panels (Plugins and whatever else is installed), collapse / expand the chats column,
*Report an issue* (opens the GitHub issues page). Everything dsh has that Muse does not
— the plugin manager, the panel list, archived sessions, developer tools — is reachable
from here or from Settings → Advanced and nowhere else.

## Not in Muse, in nanoMuse

- **The account on every device.** Sign in on the phone with the same number and the
  desktop's status line counts it; *Reach* lets either side ask the other for something
  ([hub.md](hub.md)).
- **Any model, your key.** The relay's models for members, a DeepSeek key, or any
  OpenAI-compatible provider the harness supports.
- **Open source, no closed component.** The bundle is GPL-3.0-or-later; the harness is
  MIT and travels with its notice; the About row says so.
