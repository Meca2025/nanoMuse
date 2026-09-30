# Privacy

This page is what the nanoMuse Android app does with your data. It is short because the app does little with it.

## Everything stays on the phone

The agent runs inside the app, in a Linux root file system on your phone. Conversations, memory, files the agent writes, scheduled tasks, skills and settings are stored in the app's private storage and, where you mount them, in folders you chose. There is no analytics, no crash reporting to us and no telemetry of any kind. The only nanoMuse server is the optional relay described below, and the app works fully without it.

## What leaves the phone

- **Your model provider.** Messages, attached images and tool results are sent to the model endpoint you configured (阿里云百炼, DeepSeek, OpenAI, OpenRouter, your own vLLM or Ollama, …), under that provider's terms, with the API key you entered. The key is stored on the phone only.
- **nanoMuse Cloud, if you signed in.** *Sign in with e-mail — free* on the first screen (or *Settings → nanoMuse Cloud*) signs you up with an e-mail address and a code, and the app then uses our relay as a model provider — free, ¥10 of model use per account (community members: no limit; each new person who signs up with your invite code adds ¥5, joining the co-creation programme adds ¥10 once), paid by the developer; nanoMuse is a non-profit community project and never charges. The relay forwards your messages to the model (Alibaba Cloud Model Studio) and does not store them. What it keeps: a salted hash of your address, the address itself encrypted so the person running the relay can see whose account it is (the database file alone shows nothing), a masked hint such as `s***@example.com`, the hash of the key issued to this device, the kind, model and token count of each request, and your invite code with the ids of accounts that used it. It does not receive or keep your location: the apps never send it, and the relay does not record IP addresses. Signing out revokes the key; deleting the account removes all of it. The relay's source is in the repository under `cloud/`, and [docs/cloud.md](cloud.md) says how to run your own. Nothing about the relay applies when you use your own key.
- **The co-creation programme (contributing conversations) — only if you join.** Under *Account → Co-creation programme* (off by default; offered once right after a new account, skippable) you can let the relay keep your chat turns — the messages you sent and the model's reply, with pictures replaced by a marker, plus the app's platform and language from the request headers — to train the community's own open model. Nothing else about the relay changes. The turns are tied to your account id only; exports for training carry no account id, address or hint. Turn it off any time, delete what you contributed with one tap, and deleting the account deletes them too.
- **The web, when the agent uses it.** Web search, page fetches, the in-app browser, MCP servers and command-line tools reach the sites and services they are for. What the agent sends is what you asked it to do.
- **Update check.** *Settings → About* (on the phone, *Check for updates*; the desktop app's tray; a `pipx`/Docker runtime once every six hours, `server.update_check = false` to stop it) asks the GitHub API for the latest release of `nano-muse/nanoMuse`. Nothing is sent besides the request itself, and nothing is downloaded on its own.
- **Backups.** If you back up to a remote destination (SMB, WebDAV, SFTP, S3, FTP), the backup goes there, encrypted with the password you chose.

## Permissions

Each permission is asked for when a feature needs it and is used for that feature only: notifications for the agent's status and reminders; accessibility for operating other apps' screens, which is off until you turn it on; storage folders you mount; the microphone for voice input; contacts, calendar and location for the tools of the same names, each callable only after you granted them. Nothing is read in the background.

## What the agent may do without asking

Before anything it cannot take back — deleting your files, sending a message or data out, paying — the agent stops and a card asks you, in the shell, in the browser and on the phone's screen alike. What you may remember from that card comes in three tiers, and *Settings → Permissions → Remembered approvals* lists everything you remembered, grouped the same way, one line each, tap to revoke:

- **Runs, then tells you** — installing software. Never asks; the agent says so afterwards.
- **Asks first; you may remember it** — deleting and sending. *Allow for this chat* or *Always allow for X* (one folder, one recipient, one site or app).
- **Highest: asks at the moment of paying, every time** — buying, ordering, booking, trading, transferring. There is no "for this chat". *Remember and run next time in X* exists, for one app or site only, and asks for your screen lock (fingerprint, face, PIN) before it takes; it is listed first on the permissions page, and every payment that runs on it is said out loud in the chat.

Passwords, verification codes and card numbers are never typed by the agent; those screens are handed to you. Anything alarming in a command (wiping a disk, force-pushing history, a download piped into a shell) is asked about every time and cannot be remembered. Shopping and trading are fine when you asked for exactly that; nothing unlawful or harmful is done, however it is worded — the agent refuses and says why.

## Feedback

Bug reports go to GitHub Issues from *Settings → Feedback*; the report is pre-filled with the app version and the device model and nothing else. Do not paste API keys or private conversations into an issue.

## Changes

This page changes when the app's behaviour changes; the history is in the repository.
