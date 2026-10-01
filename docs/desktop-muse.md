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

**nanoMuse on dsh.** The same three columns, from dsh's `sidebar` seat:

- The rail: the agent's face (opens the profile and settings), Chats, Search, Devices,
  a spacer, then the hamburger. Schedules and the harness's own panels appear here only
  when their plugin is installed, and the rest of the harness's panel list is in the
  hamburger, not on the rail.
- The chats column: the harness's own session list (workspaces, groups, search, new
  chat), under our column head; it collapses to the rail alone with the toggle (or
  the harness's `⌘/Ctrl B` in the desktop shell).
- Above the conversation, in the harness's `conversation.header.leading` seat, the face
  and name are pinned at the top centre with the status line: *not signed in* /
  *connecting* / *connected · N devices online* / *thinking…* / *Hands · step N · what it
  is doing* / *Reach · step N · on Laptop B: …* / *asking you*. A *Stop* button sits
  beside the status while a turn runs and stops every running session.
- Theme: the harness's light and dark palettes are overridden to Muse's tones (white
  surfaces with a `#f4f4f6` sidebar; `#1c1c1e` with a `#151517` sidebar in the dark)
  and the accent colour follows the face's colour from the account, so a face coloured
  on the phone colours the desktop too.
- The composer is the harness's. It keeps the model picker, which Muse hides: with an
  account, members may type any model id on the relay's key (chat, image or video) —
  see [cloud.md](cloud.md#allowance) — so the picker earns its place.

## The first run

**Muse.** Sign in (a phone number, an SMS code — "sign in or create an account"), a
loading page, then a carousel asking to allow the agent to use the computer: one card
per permission (accessibility for clicking and typing; screen recording for
screenshots), each with an *Allow* button, fine print, *Skip*.

**nanoMuse on dsh.** The step in the harness's `settings.onboarding` seat (we take the
shipped step's id, so a fresh install meets the agent instead of being asked for a
DeepSeek key):

1. **Welcome** — the face, *Welcome to nanoMuse*, the slogan, what it can do in one
   sentence; *Sign in with a phone number or e-mail (free)*, *Use my own API key*
   (opens Models), *Later*. Footer: *Built on DeepSeek Harness · open source*.
2. **Sign in** — the same two calls the phone uses (`/v1/auth/code`, `/v1/auth/verify`);
   a mainland number gets an SMS, anything else an e-mail.
3. **Three cards**, ‹ › and dots to move, *Skip* at the foot: **Hands** (what it can do
   on this screen; anything that sends, pays or deletes is asked first; Stop is at the
   top), **Files** (a chat runs in one workspace folder, chosen in the composer), **Your
   other devices** (sign in on the phone with the same number and the two see each
   other; *Open Devices*).
4. **Ready** — the face, *<name> is ready*, *Start*.

The step completes itself when a model can already answer (the account, a key, a
provider the person added) and does not show again. There is no OS permission card:
Hands on Linux and Windows need none, and on macOS the accessibility and screen
recording prompts are the system's own and come up on the first use.

## The profile and the face

**Muse.** The face at the top opens a profile panel on the right: a large avatar with a
pen (*change avatar* / *edit name*), tabs for the profile, the approval log (what was
allowed, when, "allowed for this task" / "always allowed"), activity, more. A new face
is drawn in the chat: four candidates in a grid, pick one, the agent confirms in words.

**nanoMuse on dsh.** The face opens Settings → Account: the name and the look as the
account has them (the dragon, an emoji on a colour, or the drawn face), the allowance,
the models. Changing the name or drawing a face is done on the phone today and shows up
here within the hub's round trip; the studio on the desktop is phase 4
([harness.md](harness.md#phases)). The approval log is the harness's own conversation
record: each approval card stays in the transcript where it was answered.

## Computer use

**Muse.** The controlled screen is shown inside the window as a dimmed live stage: an ×
to stop top-left, take-over controls top-right, a caption bottom-left saying what was
just done ("typed · <app>", "pressed ↵ · <app>"), the face as the cursor marker. Inline
permission cards in the chat — *allow <name> to take a screenshot?* / *write a file?* —
with *Allow (this task)*, *Always allow*, *Deny*.

**nanoMuse on dsh.** Hands are the runtime's `computer_screen` / `computer_act` over
MCP, so what the model sees is the screenshot it asked for and the status line says
*Hands · step N · click "Save"* while it works; the harness's approval card is the
permission card (*allow once* / *reject*, and its permission presets for the standing
answer), with the Sentinel's reasons ([sentinel.md](sentinel.md)) in it. The live stage — the controlled screen
inside the window — is not built: on the desktop the controlled screen *is* the screen.
What the phone app shows while its Hands work ([gui.md](gui.md)) is the model.

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
  licence.
- **Account** — the nanoMuse account: sign in or the masked identifier, the allowance,
  the look, the models, *Open Devices*.
- **Models**, **Agents** — the harness's pages, unchanged.
- **Devices** — this computer (its name, the remote-control switch that lets the phone
  run things here) and the other devices on the account, online dots, *Forget*.
- **Advanced** — every page another plugin registers (the harness's plugin manager,
  archived sessions…), grouped at the bottom so they are there and out of the way.
- **Sign out** at the foot while signed in.

Dictation, wallet, message channels, data export and the OS-level toggles are not there:
dsh has no equivalent of the first three in its web profile, and the last belong to the
shell (phase 5).

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
