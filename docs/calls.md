# Calls

A voice or video call with your Muse, in real time — the way you would call a
person: you talk, it answers in its voice while you are still finishing, you can
talk over it, and on a video call it sees what your camera sees. The voice on the
line is the same agent as the chat: its name, its personality, what it remembers
about you; what was said becomes part of the conversation.

## In the apps

- **Phone**: the handset button in the chat header for a voice call; *Video
  call* in the ••• menu. A dark stage: the face on its disc with rings that
  breathe with the voice, captions of the last two turns, mute, hang up, camera
  on or off. On a video call the front camera is the backdrop and one small
  frame a second goes to the model.
- **Web and desktop**: the *Call* screen from the chat header — the microphone
  through an audio worklet at 16 kHz, the speaker at 24 kHz, the camera at one
  frame a second on a video call. The line and the running cost sit in a pill
  at the top.

The first `RECORD_AUDIO` (and `CAMERA`) permission is asked when you first
call. Nothing is recorded on the device: frames are sent and dropped.

## Where the call goes

The model is Alibaba's Qwen Omni real-time family (`qwen3.5-omni-flash-realtime`
by default), spoken to over its OpenAI-Realtime-shaped WebSocket:

- **Signed in to nanoMuse Cloud** — the relay's `WS /v1/realtime`, with the
  account's key. The relay meters the call as usage of kind *realtime*: after
  every answer it adds a `nanomuse {charged, cost_cny, request}` block to
  `response.done` (the apps show ¥ live), and it hangs up when the day's
  allowance is used up (close 4429), after `REALTIME_MAX_S` (an hour by
  default; close 4408) or when the provider drops (close 4502). The relay
  forwards audio and frames; it keeps nothing of them.
- **Your own key** — when the model provider is Bailian / Model Studio, the app
  or runtime opens the provider's socket directly with your key. Nothing goes
  through the project's server.
- Otherwise the call button says why it cannot connect.

## The runtime's bridge

On a computer or in nanoMuse Web the app does not hold the key; it calls
`WS /ws/call?token=…&video=1` on its runtime (`nanomuse/call.py`), which

- decides the route above and opens the provider's session;
- writes the session opener from the profile — name, personality, memories of
  the person — in the same tone as the chat (`[cloud] realtime_model` and
  `realtime_voice` override the model and the voice; the provider's voices are
  Cherry, Tina, Chelsie, …);
- passes the protocol through untouched: `input_audio_buffer.append` (PCM16,
  16 kHz) and `input_image_buffer.append` (a JPEG a second) up,
  `response.audio.delta` (PCM 24 kHz), the transcripts and `response.done`
  down; server VAD, so the model stops when you start talking;
- records what was said in the main chat as `user` / `assistant` events flagged
  `via: "call"`, so the Muse can refer back to the call later;
- publishes the call's state on the bus and tells the app the cost after every
  answer and why a call ended (`daily_cap`, `call_too_long`, `unreachable`,
  `bad_key`, `no_route`).

`GET /api/cloud/call` says whether a call is possible right now, by which route,
with which model, and why not.

## What is kept

By the relay: for each answer, the token split (text, audio, picture) and its
cost; for each call, a `call.ended` line in the account's timeline with the
model and the length. Never the audio, never the frames, never the words. On
your devices: the transcript in the chat, like any other messages — delete the
chat and it is gone.

The tests are `tests/test_call.py` (the route, the opener, the transcript) and,
on the relay, the realtime cases in `cloud/tests/`.
