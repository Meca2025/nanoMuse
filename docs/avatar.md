# The avatar studio

The agent's face is the bundled dragon until you ask for another. On the phone since
0.1.20 and, from 0.1.23, on the web app and the desktop through the runtime
(`nanomuse/avatar/studio.py`), the studio draws one from a description, in the chat:

1. **Ask.** In the chat: 「换个形象：一只戴圆眼镜的橘猫」, "new avatar: a robot owl",
   "change your avatar to a small fox with a scarf". Or *Settings → Draw a new one*, which
   sends the same request. The agent is not run for it.
2. **The cost first.** A card says what it will take: with the account's model (nanoMuse
   Cloud), the relay's figure (`GET /v1/estimate`) next to what is left in your allowance —
   about ¥1.5 for the eight pictures at qwen-image-3.0's price; with a key of your own, the
   count, at your provider's prices. *Draw* or *Not now*.
3. **Four to choose from.** The same subject four times — classic colouring, lighter, darker
   with a small accessory, a playful take — Muse's vinyl-toy style, full body on white. Tap
   one, or say which (「第二个」, "the first one", "top right"); *Redraw* for four more.
4. **The poses.** The pick is the idle still; four edits of it are the other moods — working
   with headphones at a laptop, waiting with a crystal ball, happy hugging a star, sorry with a
   sweat drop — the set the dragon has. They land in the workspace under
   `avatar/<face>/<mood>.webp`; the profile's `avatar` becomes the face id; every app on the
   account shows it (through `/api/files/avatar/<face>/<mood>.webp`). A pose that could not
   be drawn shows the idle picture instead.

Where the pictures come from: the chat model's host and key. The relay speaks the OpenAI
images API (`/v1/images/generations`, `/v1/images/edits`), as does any OpenAI-compatible
provider that draws; Alibaba Cloud Model Studio's own host has neither and is called on its
native multimodal endpoint with the same key (qwen-image-3.0 by default). Which model draws
is `[llm] image_model` in `config.toml` or *Connections → Image & video models* in the app;
empty means the relay's image model for the account, qwen-image-3.0 on Model Studio, none
elsewhere — and then the chat says so plainly instead of trying.

The phone's studio also animates the chosen face (short clips through the video model);
the web and the desktop show stills. `GET /api/avatar` says whether a face can be drawn
here and which session is under way; `POST /api/avatar/begin|start|choose|cancel` drive it
(the chat card uses them). Candidates of finished sessions are cleared after a day; faces
stay in the workspace as long as the profile — or you — want them.
