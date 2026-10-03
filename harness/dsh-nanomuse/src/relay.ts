/**
 * The nanoMuse Cloud relay as a client: the handful of `/v1` calls the desktop
 * needs to sign in, learn who it is and which models the account's key may use.
 * Plain `fetch`, no Cordis — the service in `cloud.ts` owns state and wiring,
 * and the tests drive this against a fake relay.
 *
 * The relay speaks OpenAI Chat Completions under `/v1`, so the account's key is
 * handed to the harness's own model adapter (`dsh-llm-pi-ai`) rather than to
 * an adapter of ours; nothing here touches a model request.
 */

/** A relay error, with the relay's own code when it sent one. */
export class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RelayError'
  }
}

/** The relay's view of the signed-in account (`GET /v1/me`, trimmed). */
export interface Account {
  /** Opaque account id — never the phone number or e-mail. */
  id: string
  /** `phone` or `email`. */
  channel: string
  /** Masked identifier the relay already prepared for display, e.g. `195****0404`. */
  hint: string
  member: boolean
  tokens: {
    unlimited: boolean
    granted: number
    used: number
    remaining: number
  }
  /** Data controls — "Help improve nanoMuse's AI models" (relay 0.9); absent on an older relay. */
  contribute?: DataControls
}

/** The switch over what the relay keeps of the account's chats, and what it holds so far. */
export interface DataControls {
  on: boolean
  samples: number
  /** How the relay starts new accounts; undefined when it did not say. */
  defaultOn?: boolean
  privacyUrl: string
}

/** One model the account may use, as `GET /v1/models` lists it. */
export interface RelayModel {
  id: string
  name: string
  /** `chat`, `image`, `video` — only `chat` models join the model picker. */
  kind: string
  recommended: boolean
  inputModalities: string[]
}

export interface SignIn {
  apiKey: string
  created: boolean
  account: Account
}

/** The account's invite code and what it has brought (`GET /v1/me/invite`, trimmed: no friends' hints). */
export interface Invite {
  code: string
  url: string
  invites: number
  /** What a friend who signs up with the code gets, and what the inviter earns — the same figure. */
  bonusCny: number
  earnedCny: number
}

/** What the desktop may write to the account's profile: the name and the simple looks. */
export interface ProfileWrite {
  name: string
  avatar: 'dragon' | 'emoji' | 'face'
  emoji: string
  color: string
  style: string
  description: string
  /** A drawn face's stills, `{mood: base64 WebP}` — only when a face was drawn here. */
  face?: Record<string, string>
}

/** What a few pictures would cost next to what is left today (`GET /v1/estimate`). */
export interface Estimate {
  cny: number
  leftCny: number
  unlimited: boolean
  affordable: boolean
  imageModel: string
}

/** The account's profile as the relay keeps it (`docs/hub.md`): the agent's name and look. */
export interface RelayProfile {
  /** 0 until a device has written one. */
  rev: number
  /** The device that wrote this rev. */
  device: string
  name: string
  /** `dragon`, `emoji`, `face` (one drawn in the avatar studio), or empty. */
  avatar: string
  emoji: string
  color: string
  style: string
  description: string
  hasFace: boolean
  /** The hash of the idle still — a device wearing these pictures keeps its copy. */
  faceId: string
  /** `mood -> base64 WebP`, when asked for. */
  face?: Record<string, string>
}

const JSON_HEADERS = { 'content-type': 'application/json' }

async function fail(res: Response): Promise<never> {
  let code = `http_${res.status}`
  let message = `${res.status} ${res.statusText}`.trim()
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    if (body.error?.code) code = body.error.code
    if (body.error?.message) message = body.error.message
  } catch {
    // not JSON — the status line is the message
  }
  throw new RelayError(res.status, code, message)
}

function toDataControls(ct: unknown): DataControls | undefined {
  if (!ct || typeof ct !== 'object') return undefined
  const c = ct as Record<string, unknown>
  return {
    on: Boolean(c.on),
    samples: Number(c.samples ?? 0),
    ...(typeof c.default_on === 'boolean' ? { defaultOn: c.default_on } : {}),
    privacyUrl: String(c.privacy_url ?? ''),
  }
}

function toAccount(me: Record<string, unknown>): Account {
  const account = (me.account ?? {}) as Record<string, unknown>
  const tokens = (me.tokens ?? {}) as Record<string, unknown>
  const contribute = toDataControls(me.contribute)
  return {
    id: String(account.id ?? ''),
    channel: String(account.channel ?? ''),
    hint: String(account.hint ?? ''),
    member: Boolean(account.member),
    tokens: {
      unlimited: Boolean(tokens.unlimited),
      granted: Number(tokens.granted ?? 0),
      used: Number(tokens.used ?? 0),
      remaining: Number(tokens.remaining ?? 0),
    },
    ...(contribute ? { contribute } : {}),
  }
}

/** A client for one relay origin, e.g. `https://cloud.nanomuse.cn`. */
export class Relay {
  readonly origin: string

  constructor(origin: string, private readonly fetchImpl: typeof fetch = fetch) {
    this.origin = origin.replace(/\/+$/, '')
  }

  /** The OpenAI-compatible root the model adapter is pointed at. */
  get openaiBase(): string {
    return `${this.origin}/v1`
  }

  /** Ask for a six-digit code (SMS for a mainland number, e-mail otherwise). */
  async requestCode(identifier: string, signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(`${this.origin}/v1/auth/code`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ identifier }),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
  }

  /** Trade the code for this device's key. */
  async verify(identifier: string, code: string, device: string, signal?: AbortSignal): Promise<SignIn> {
    const res = await this.fetchImpl(`${this.origin}/v1/auth/verify`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ identifier, code: code.trim(), device: device.slice(0, 80) }),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as Record<string, unknown>
    return { apiKey: String(body.api_key ?? ''), created: Boolean(body.created), account: toAccount(body) }
  }

  /** The password way in, for people who set one (`POST /v1/auth/login`). */
  async login(identifier: string, password: string, device: string, signal?: AbortSignal): Promise<SignIn> {
    const res = await this.fetchImpl(`${this.origin}/v1/auth/login`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ identifier, password, device: device.slice(0, 80) }),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as Record<string, unknown>
    return { apiKey: String(body.api_key ?? ''), created: false, account: toAccount(body) }
  }

  /** The account's invite code and link, and what inviting has brought (`GET /v1/me/invite`). */
  async invite(apiKey: string, signal?: AbortSignal): Promise<Invite> {
    const res = await this.fetchImpl(`${this.origin}/v1/me/invite`, { headers: this.auth(apiKey), signal: signal ?? null })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as Record<string, unknown>
    return {
      code: String(body.code ?? ''),
      url: String(body.url ?? ''),
      invites: Number(body.invites ?? 0),
      bonusCny: Number(body.bonus_cny ?? 0),
      earnedCny: Number(body.earned_cny ?? 0),
    }
  }

  /**
   * Write the agent's name and look for every device of the account
   * (`PUT /v1/me/profile`, last writer wins). Only the fields given move; a
   * drawn face stays as it is, since the desktop has no studio of its own.
   */
  async putProfile(apiKey: string, body: ProfileWrite, device: string, signal?: AbortSignal): Promise<number> {
    const res = await this.fetchImpl(`${this.origin}/v1/me/profile`, {
      method: 'PUT',
      headers: { ...this.auth(apiKey), ...JSON_HEADERS },
      body: JSON.stringify({ ...body, device: device.slice(0, 80) }),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
    const out = (await res.json().catch(() => ({}))) as { rev?: number }
    return Number(out.rev ?? 0)
  }

  /** What `images` pictures would cost today, and the image model the relay would use (nothing charged). */
  async estimate(apiKey: string, images: number, signal?: AbortSignal): Promise<Estimate> {
    const res = await this.fetchImpl(`${this.origin}/v1/estimate?images=${Math.max(0, Math.floor(images))}`, { headers: this.auth(apiKey), signal: signal ?? null })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as { cny?: number; left_cny?: number; unlimited?: boolean; affordable?: boolean; parts?: { kind?: string; model?: string }[] }
    return {
      cny: Number(body.cny ?? 0),
      leftCny: Number(body.left_cny ?? 0),
      unlimited: body.unlimited === true,
      affordable: body.affordable !== false,
      imageModel: String(body.parts?.find((p) => p.kind === 'image')?.model ?? ''),
    }
  }

  /** One picture from words (`POST /v1/images/generations`, OpenAI's shape); the bytes. */
  async generateImage(apiKey: string, model: string, prompt: string, signal?: AbortSignal): Promise<Buffer> {
    const res = await this.fetchImpl(`${this.origin}/v1/images/generations`, {
      method: 'POST',
      headers: { ...this.auth(apiKey), ...JSON_HEADERS },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
    return this.imageOf(await res.json())
  }

  /** The same character in another pose (`POST /v1/images/edits`, multipart); the bytes. */
  async editImage(apiKey: string, model: string, image: Buffer, prompt: string, signal?: AbortSignal): Promise<Buffer> {
    const form = new FormData()
    form.set('model', model)
    form.set('prompt', prompt)
    form.set('n', '1')
    form.set('size', '1024x1024')
    form.set('response_format', 'b64_json')
    form.set('image', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'idle.png')
    const res = await this.fetchImpl(`${this.origin}/v1/images/edits`, { method: 'POST', headers: this.auth(apiKey), body: form, signal: signal ?? null })
    if (!res.ok) await fail(res)
    return this.imageOf(await res.json())
  }

  private async imageOf(body: unknown): Promise<Buffer> {
    const first = ((body as { data?: { b64_json?: string; url?: string }[] }).data ?? [])[0]
    if (first?.b64_json) return Buffer.from(first.b64_json, 'base64')
    if (first?.url) {
      const res = await this.fetchImpl(first.url)
      if (!res.ok) throw new RelayError(502, 'image', `The picture could not be fetched (${res.status})`)
      return Buffer.from(await res.arrayBuffer())
    }
    throw new RelayError(502, 'image', 'The model returned no picture')
  }

  /** Who the key belongs to and what is left of the allowance. */
  async me(apiKey: string, signal?: AbortSignal): Promise<Account> {
    const res = await this.fetchImpl(`${this.origin}/v1/me`, { headers: this.auth(apiKey), signal: signal ?? null })
    if (!res.ok) await fail(res)
    return toAccount((await res.json()) as Record<string, unknown>)
  }

  /** The models the relay offers this key. */
  async models(apiKey: string, signal?: AbortSignal): Promise<RelayModel[]> {
    const res = await this.fetchImpl(`${this.origin}/v1/models`, { headers: this.auth(apiKey), signal: signal ?? null })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as { data?: Record<string, unknown>[] }
    return (body.data ?? []).map((m) => {
      const arch = (m.architecture ?? {}) as Record<string, unknown>
      const extra = (m.nanomuse ?? {}) as Record<string, unknown>
      return {
        id: String(m.id ?? ''),
        name: String(m.name ?? m.id ?? ''),
        kind: String(extra.kind ?? 'chat'),
        recommended: Boolean(extra.recommended),
        inputModalities: Array.isArray(arch.input_modalities) ? arch.input_modalities.map(String) : ['text'],
      }
    })
  }

  /** The hub socket for this relay (`ws://` for a dev relay on plain HTTP). */
  get hubURL(): string {
    return `${this.origin.replace(/^http/, 'ws')}/v1/hub`
  }

  /**
   * The account's name and look (`GET /v1/me/profile`). Without the face the
   * answer is small; with it, the five stills come along as base64 WebP.
   */
  async profile(apiKey: string, withFace: boolean, signal?: AbortSignal): Promise<RelayProfile> {
    const res = await this.fetchImpl(`${this.origin}/v1/me/profile?face=${withFace ? 'true' : 'false'}`, {
      headers: this.auth(apiKey),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
    const body = (await res.json()) as Record<string, unknown>
    const face = body.face && typeof body.face === 'object' ? (body.face as Record<string, unknown>) : undefined
    return {
      rev: Number(body.rev ?? 0),
      device: String(body.device ?? ''),
      name: String(body.name ?? ''),
      avatar: String(body.avatar ?? ''),
      emoji: String(body.emoji ?? ''),
      color: String(body.color ?? ''),
      style: String(body.style ?? ''),
      description: String(body.description ?? ''),
      hasFace: Boolean(body.has_face),
      faceId: String(body.face_id ?? ''),
      ...(face ? { face: Object.fromEntries(Object.entries(face).filter(([, v]) => typeof v === 'string')) as Record<string, string> } : {}),
    }
  }

  /**
   * Data controls: flip "Help improve nanoMuse's AI models". While on, the relay keeps the
   * account's chat turns (what was written, what was answered, the tool calls) for the
   * community's own model; the allowance is not touched.
   */
  async setContribute(apiKey: string, on: boolean, signal?: AbortSignal): Promise<DataControls> {
    const res = await this.fetchImpl(`${this.origin}/v1/me/contribute`, {
      method: 'POST',
      headers: { ...this.auth(apiKey), ...JSON_HEADERS },
      body: JSON.stringify({ on }),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
    return toDataControls(await res.json()) ?? { on, samples: 0, privacyUrl: '' }
  }

  /** Delete every turn the relay kept from the account; how many went. */
  async deleteSamples(apiKey: string, signal?: AbortSignal): Promise<number> {
    const res = await this.fetchImpl(`${this.origin}/v1/me/samples`, {
      method: 'DELETE',
      headers: this.auth(apiKey),
      signal: signal ?? null,
    })
    if (!res.ok) await fail(res)
    const body = (await res.json().catch(() => ({}))) as { deleted?: number }
    return Number(body.deleted ?? 0)
  }

  /** Retire this device's key on the relay; a key the relay no longer knows is fine. */
  async signOut(apiKey: string, signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(`${this.origin}/v1/auth/sign-out`, {
      method: 'POST',
      headers: this.auth(apiKey),
      signal: signal ?? null,
    })
    if (!res.ok && res.status !== 401) await fail(res)
  }

  private auth(apiKey: string): Record<string, string> {
    return { authorization: `Bearer ${apiKey}` }
  }
}
