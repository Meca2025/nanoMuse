# Privacy

This page is what the nanoMuse Android app does with your data. It is short because the app does little with it.

## Everything stays on the phone

The agent runs inside the app, in a Linux root file system on your phone. Conversations, memory, files the agent writes, scheduled tasks, skills and settings are stored in the app's private storage and, where you mount them, in folders you chose. There is no analytics, no crash reporting to us and no telemetry of any kind. The only nanoMuse server is the optional relay described below, and the app works fully without it.

## What leaves the phone

- **Your model provider.** Messages, attached images and tool results are sent to the model endpoint you configured (阿里云百炼, DeepSeek, OpenAI, OpenRouter, your own vLLM or Ollama, …), under that provider's terms, with the API key you entered. The key is stored on the phone only.
- **nanoMuse Cloud, if you signed in.** *Start now* on the first screen (or *Settings → nanoMuse Cloud*) signs you up with a phone number or e-mail address and a code, and the app then uses our relay as a model provider with a starter allowance. The relay forwards your messages to the model (Alibaba Cloud Model Studio) and does not store them. What it keeps: a salted hash of your number or address, the number or address itself encrypted so the person running the relay can see whose account it is (the database file alone shows nothing), a masked hint such as `138****8000`, the hash of the key issued to this phone, and the token count of each request. Signing out revokes the key; deleting the account removes all of it. The relay's source is in the repository under `cloud/`, and [docs/cloud.md](cloud.md) says how to run your own. Nothing about the relay applies when you use your own key.
- **The web, when the agent uses it.** Web search, page fetches, the in-app browser, MCP servers and command-line tools reach the sites and services they are for. What the agent sends is what you asked it to do.
- **Update check.** *Settings → About → Check for updates* asks the GitHub API for the latest release of `nano-muse/nanoMuse`. Nothing is sent besides the request itself.
- **Backups.** If you back up to a remote destination (SMB, WebDAV, SFTP, S3, FTP), the backup goes there, encrypted with the password you chose.

## Permissions

Each permission is asked for when a feature needs it and is used for that feature only: notifications for the agent's status and reminders; accessibility for operating other apps' screens, which is off until you turn it on; storage folders you mount; the microphone for voice input; contacts, calendar and location for the tools of the same names, each callable only after you granted them. Nothing is read in the background.

## Feedback

Bug reports go to GitHub Issues from *Settings → Feedback*; the report is pre-filled with the app version and the device model and nothing else. Do not paste API keys or private conversations into an issue.

## Changes

This page changes when the app's behaviour changes; the history is in the repository.
