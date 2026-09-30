/**
 * The audio plumbing of a call, kept apart from the screen: the microphone captured through
 * an AudioWorklet and resampled to 16 kHz PCM16 (what the real-time models take), the model's
 * 24 kHz PCM16 answer scheduled back-to-back on an AudioContext, levels for the visuals, and
 * camera frames as JPEG for a video call. No React in here.
 */

const CAPTURE_RATE = 16000;
const PLAYBACK_RATE = 24000;
/** ~100 ms of 16 kHz audio per frame sent to the server */
const CHUNK_SAMPLES = 1600;

const WORKLET_SOURCE = `
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(0);
    this.acc = [];
    this.accLen = 0;
    this.ratio = sampleRate / ${CAPTURE_RATE};
    this.pos = 0;
    this.level = 0;
    this.frames = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    // level for the visuals, every ~50 ms
    let sum = 0;
    for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    this.level = Math.max(this.level * 0.7, Math.sqrt(sum / ch.length));
    if (++this.frames % 16 === 0) this.port.postMessage({ level: this.level });
    // linear resampling to ${CAPTURE_RATE} Hz
    const merged = new Float32Array(this.buf.length + ch.length);
    merged.set(this.buf, 0);
    merged.set(ch, this.buf.length);
    const outLen = Math.floor((merged.length - 1 - this.pos) / this.ratio);
    if (outLen <= 0) { this.buf = merged; return true; }
    const out = new Int16Array(outLen);
    let p = this.pos;
    for (let i = 0; i < outLen; i++) {
      const j = Math.floor(p);
      const f = p - j;
      const s = merged[j] * (1 - f) + merged[j + 1] * f;
      out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
      p += this.ratio;
    }
    const consumed = Math.floor(p);
    this.buf = merged.subarray(consumed);
    this.pos = p - consumed;
    this.acc.push(out);
    this.accLen += out.length;
    if (this.accLen >= ${CHUNK_SAMPLES}) {
      const all = new Int16Array(this.accLen);
      let o = 0;
      for (const a of this.acc) { all.set(a, o); o += a.length; }
      this.acc = [];
      this.accLen = 0;
      this.port.postMessage({ pcm: all.buffer }, [all.buffer]);
    }
    return true;
  }
}
registerProcessor("nanomuse-capture", Capture);
`;

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** The microphone → 16 kHz PCM16 chunks (base64) and a level between 0 and 1. */
export class Microphone {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private muted = false;
  level = 0;

  async start(onChunk: (b64: string) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    });
    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "nanomuse-capture", { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node.port.onmessage = (ev: MessageEvent<{ level?: number; pcm?: ArrayBuffer }>) => {
      if (ev.data.level !== undefined) this.level = this.muted ? 0 : Math.min(1, ev.data.level * 4);
      if (ev.data.pcm && !this.muted) onChunk(toBase64(ev.data.pcm));
    };
    source.connect(this.node);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  stop(): void {
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.level = 0;
  }
}

/** The model's PCM16 24 kHz audio, played as it arrives, with a level for the visuals. */
export class Speaker {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private nextAt = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private data: Uint8Array<ArrayBuffer> | null = null;

  async start(): Promise<void> {
    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.gain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.data = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    this.gain.connect(this.analyser).connect(this.ctx.destination);
    this.nextAt = 0;
  }

  /** One `response.audio.delta`. */
  play(b64: string): void {
    if (!this.ctx || !this.gain) return;
    const pcm = new Int16Array(fromBase64(b64));
    if (pcm.length === 0) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, PLAYBACK_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    const now = this.ctx.currentTime;
    // a little headroom on the first chunk so the next one is scheduled before it ends
    const at = Math.max(now + 0.03, this.nextAt);
    src.start(at);
    this.nextAt = at + buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** How much is still queued, in seconds. */
  pending(): number {
    if (!this.ctx) return 0;
    return Math.max(0, this.nextAt - this.ctx.currentTime);
  }

  /** The person started talking over it: drop what has not been played yet. */
  interrupt(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already done */
      }
    }
    this.sources.clear();
    this.nextAt = 0;
  }

  level(): number {
    if (!this.analyser || !this.data) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 3);
  }

  stop(): void {
    this.interrupt();
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** The camera, one JPEG a second, as base64 without the data-URL prefix. */
export class Camera {
  stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private timer: number | undefined;

  async start(video: HTMLVideoElement, onFrame: (jpegB64: string) => void, fps = 1): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
      audio: false,
    });
    this.video = video;
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => undefined);
    this.canvas = document.createElement("canvas");
    this.timer = window.setInterval(() => {
      if (!this.video || !this.canvas || this.video.videoWidth === 0) return;
      const w = 512;
      const h = Math.round((this.video.videoHeight / this.video.videoWidth) * w) || 384;
      this.canvas.width = w;
      this.canvas.height = h;
      const g = this.canvas.getContext("2d");
      if (!g) return;
      g.drawImage(this.video, 0, 0, w, h);
      const url = this.canvas.toDataURL("image/jpeg", 0.6);
      onFrame(url.slice(url.indexOf(",") + 1));
    }, Math.round(1000 / fps));
  }

  stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }
}
