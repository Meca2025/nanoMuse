# The hub: every device is a Muse

Sign in to the same nanoMuse Cloud account on a phone, a computer and a browser,
and they see each other. Each device runs its own Muse with its own hands — the
phone's apps and sandbox, the computer's shell and screen — and any of them can
ask any other for something, from any network. The web console has no hands of
its own; it is a front door to the rest.

```
phone ──┐                         ┌── computer (nanoMuse Desktop)
        ├──▶  nanoMuse Cloud  ◀───┤
web  ───┘        /v1/hub          └── another phone / computer
```

Every device opens one outbound WebSocket to the relay and keeps it. Nothing
listens on the device, nothing needs a port forwarded or a shared Wi-Fi; the
relay only routes frames between devices of one account and never looks inside
a task. Pairing over the local network (`host/nanomuse_host.py`) still works and
needs no relay at all; the hub is what makes the same commands work from the
train.

## What you can say

On the phone, in any chat:

- "在我 Mac 上列一下下载文件夹" — `nanomuse-pc ls ~/Downloads --on mac`
- "让电脑把项目编译一遍，把日志发给我" — `nanomuse-pc task "…" --on desk`
- "电脑截个图给我看" — `nanomuse-pc screen --on desk`

On the computer, in the terminal (`nanomuse-desktop`):

- "on my phone, take a screenshot" — `device_screen`
- "tell the phone's Muse to read me the last notification" — `delegate`
- "send the phone a notification: dinner's ready" — `device_notify`

In the web console (`/app`): pick a device, type. The task runs on that
device's Muse; approvals show as cards in the page.

Two kinds of request travel over the hub:

- **Actions** — `info`, `shell`, `files`, `file.get`, `file.put`, `open`,
  `screen`, `notify`. Raw and immediate. A `shell` command is judged *on the
  caller* before it is sent, with the same ladder as a local command (the
  phone's ShellGuard, the desktop's `guard.py`): reads and builds go quietly,
  deleting / sending / paying / system commands wait for the approval card on
  the device that asked.
- **Tasks** — `task {text}`: a whole job in words for the target device's own
  Muse, in a conversation of its own. It may take minutes. When that Muse hits
  something that needs approval, it does not decide alone: the question travels
  back as an `event {stage:"approval"}` and the asking device shows its usual
  card (RiskGate on the phone, the terminal prompt on the desktop, a card in the
  web console). The answer goes back as `approve {approval_id, allow}`.

Each device decides what it lets others do. **Remote control** off (phone:
*Settings → nanoMuse Cloud → Devices*; desktop: `set remote_control off`) makes
the device answer `info` and nothing else — it still sees and drives the others.

## Frames

JSON text frames over `WS /v1/hub`, `Authorization: Bearer nm_…` (browsers put
the key in `hello` instead).

```
→ hello    {device:{id,name,kind,os,version,actions[]}}     kind: phone | computer | web
← welcome  {device_id, devices:[…], server:{version,frame_limit,time}}
← devices  {devices:[{id,name,kind,os,version,online,last_seen,controllable}]}

→ call     {id, to, action, args}
← call     {id, from:{id,name,kind}, action, args}          (delivered to the target)
→ event    {id, body}          ← event  {id, from, body}    progress, approvals, images
→ result   {id, ok, body | error, message}                  ← result (to the caller)
← error    {code, message, id?}   device_offline · not_controllable · self_call · unknown_call · too_large · bad_frame

→ devices  {}        → rename {name}        → forget {device_id}        → ping  ← pong
```

Close codes: `4000` hello expected, `4001` bad key, `4002` bad device,
`4003` replaced by a newer connection of the same device id.

Device ids are per installation (`phone-…`, `pc-…`); names are for people and
can be changed on the device. A `web` device is never a target and is not
remembered. Bodies for `file.get`, `file.put` and `screen` carry the bytes in
base64 (`data`) with `mime`; the desktop refuses files over 8 MB, the relay
refuses frames over `HUB_FRAME_LIMIT`.

## The code

How the devices' apps are shaped around these frames — the Devices page, a
side chat addressed to a device, approvals answered on either end, the
computer's own hands — is in [every-device.md](every-device.md).

- Relay: [`cloud/nanomuse_cloud/hub.py`](../cloud/nanomuse_cloud/hub.py) —
  per-account registry, routing, `GET /v1/devices`, `DELETE /v1/devices/{id}`;
  the console under [`cloud/nanomuse_cloud/console/`](../cloud/nanomuse_cloud/console/).
- Android: `io.github.nanomuse.hub` — `HubClient` (OkHttp, reconnect),
  `Hub` (state, prefs, `call`/`find`), `HubActions` (what the phone does for
  others, including `task` through the headless chat runner), `HubService`
  (foreground, `remoteMessaging`). `nanomuse-pc` reaches hub devices next to
  LAN-paired computers.
- Desktop: [`desktop/nanomuse_desktop/hub.py`](../desktop/nanomuse_desktop/hub.py),
  `app.py` (incoming calls, approvals), `agent.py` (the `device_*` and
  `delegate` tools).

## Trust

The relay authenticates every socket with the account key and routes only
within the account; it stores device names and last-seen times, not what was
asked. A device answers only devices of its own account, and only while its
*Remote control* switch is on. Commands are judged where they are typed, before
they leave; a remote Muse's approvals are answered by the person who asked,
never by the other Muse. Signing out on a device revokes that device's key at
the relay and takes it off the hub; the *Devices* list on the phone and the
console shows every device that has ever signed in, so a device you no longer
recognise is visible, and *Forget* removes it once it is offline.
