// Browser client for the server-proxied Gemini Live voice session.
// Streams mic audio (PCM16 @16k) up, plays Gemini's audio (PCM24k) back, and
// surfaces transcripts + confirm-gate events. The API key never touches the
// browser - we connect to our own /voice/live endpoint with the user's JWT.

export type ChooseOption = { id: string; label: string; sublabel?: string };
export type LiveRow = { id?: string; title?: string; subtitle?: string; label?: string; value?: string; fields?: Array<{ label: string; value: string }> };
export type LiveCard =
  | { kind: "choose"; ref: string; title: string; options: ChooseOption[] }
  | { kind: "detail" | "list"; entity: string; title: string; rows: LiveRow[] }
  | { kind: "confirm"; action: string; title: string; message: string; rows: LiveRow[] }
  | { kind: "saved"; title: string; rows: LiveRow[] };

export type LiveEvent =
  | { type: "ready" }
  | { type: "transcript"; role: "user" | "assistant"; text: string }
  | { type: "card"; card: LiveCard }
  | { type: "closed" }
  | { type: "error"; message: string };

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const unb64 = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * Capture worklet: downsamples to 16k and posts Int16 frames. Running on the
 * audio thread keeps mic capture steady even while React is re-rendering - a
 * ScriptProcessorNode here made the whole conversation feel laggy.
 */
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this._acc = []; this._accLen = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const ratio = sampleRate / 16000;
    const outLen = Math.floor(ch.length / ratio);
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      let s = ch[Math.floor(i * ratio)];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this._acc.push(out); this._accLen += out.length;
    // ~128ms per message: small enough to stay responsive, large enough to
    // avoid flooding the main thread with postMessage traffic.
    if (this._accLen >= 2048) {
      const merged = new Int16Array(this._accLen);
      let o = 0;
      for (const part of this._acc) { merged.set(part, o); o += part.length; }
      this._acc = []; this._accLen = 0;
      this.port.postMessage(merged.buffer, [merged.buffer]);
    }
    return true;
  }
}
registerProcessor('sornam-capture', Capture);
`;

export class GeminiLiveClient {
  private ws?: WebSocket;
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private legacyProc?: ScriptProcessorNode;
  private playHead = 0;
  private queued: AudioBufferSourceNode[] = [];
  private stopped = false;

  constructor(
    private readonly apiBase: string,
    private readonly token: string,
    private readonly on: (e: LiveEvent) => void,
    private readonly lang: string = "en"
  ) {}

  async start() {
    this.stopped = false;
    const wsUrl = `${this.apiBase.replace(/^http/, "ws")}/voice/live?token=${encodeURIComponent(this.token)}&lang=${encodeURIComponent(this.lang)}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (evt) => this.onMessage(evt.data);
    this.ws.onclose = () => this.on({ type: "closed" });
    this.ws.onerror = () => this.on({ type: "error", message: "Voice connection failed." });
    await this.startMic();
  }

  stop() {
    this.stopped = true;
    this.dropQueuedAudio();
    this.node?.disconnect();
    this.legacyProc?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.ws?.close();
  }

  /** User tapped a chooser card: tell the server which id to continue with. */
  choose(id: string) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "choose", id }));
  }

  private send(pcm: Uint8Array) {
    if (this.stopped || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "audio", data: b64(pcm) }));
  }

  private async startMic() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    await this.ctx.resume();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const src = this.ctx.createMediaStreamSource(this.stream);

    try {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      this.node = new AudioWorkletNode(this.ctx, "sornam-capture");
      this.node.port.onmessage = (e) => this.send(new Uint8Array(e.data as ArrayBuffer));
      src.connect(this.node);
      // Not connected to destination: capture must never echo into the speakers.
    } catch {
      // Older browsers: fall back to the main-thread processor.
      this.legacyProc = this.ctx.createScriptProcessor(4096, 1, 1);
      this.legacyProc.onaudioprocess = (e) => this.send(this.to16kPCM(e.inputBuffer.getChannelData(0), this.ctx!.sampleRate));
      src.connect(this.legacyProc);
      this.legacyProc.connect(this.ctx.destination);
    }
  }

  private onMessage(raw: string) {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case "audio": this.play(unb64(msg.data)); return;
      case "interrupted": this.dropQueuedAudio(); return;
      case "transcript": this.on({ type: "transcript", role: msg.role, text: msg.text }); return;
      case "ready": this.on({ type: "ready" }); return;
      case "ui": this.on({ type: "card", card: msg.card }); return;
      case "error": this.on({ type: "error", message: msg.message }); return;
      case "closed": this.on({ type: "closed" }); return;
      default: return;
    }
  }

  private to16kPCM(float32: Float32Array, inRate: number) {
    const ratio = inRate / 16000;
    const outLen = Math.floor(float32.length / ratio);
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i += 1) {
      const s = Math.max(-1, Math.min(1, float32[Math.floor(i * ratio)]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(out.buffer);
  }

  /** Barge-in: cut everything still scheduled so we stop talking over the user. */
  private dropQueuedAudio() {
    this.queued.forEach((node) => { try { node.stop(); } catch { /* already ended */ } });
    this.queued = [];
    this.playHead = 0;
  }

  private play(bytes: Uint8Array) {
    if (!this.ctx || this.stopped) return;
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i += 1) f32[i] = int16[i] / 32768;
    const buf = this.ctx.createBuffer(1, f32.length, 24000);
    buf.getChannelData(0).set(f32);
    const node = this.ctx.createBufferSource();
    node.buffer = buf;
    node.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    // Never schedule in the past, and never let a backlog drift more than a
    // moment ahead of realtime - drift is what makes replies feel delayed.
    if (this.playHead < now) this.playHead = now;
    node.start(this.playHead);
    this.playHead += buf.duration;
    this.queued.push(node);
    node.onended = () => { this.queued = this.queued.filter((n) => n !== node); };
  }
}
