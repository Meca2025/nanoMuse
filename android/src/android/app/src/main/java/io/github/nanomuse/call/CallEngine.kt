package io.github.nanomuse.call

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Base64
import com.openminis.app.MinisApp
import com.openminis.app.agent.SoulStore
import com.openminis.app.logging.AppLogger
import io.github.nanomuse.cloud.NanoMuseCloud
import io.github.nanomuse.sysfiles.SystemFiles
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min
import kotlin.math.sqrt

/**
 * A voice or video call with the Muse, in real time (docs/calls.md). The microphone goes out as
 * 16 kHz pcm16 (`input_audio_buffer.append`), the model's voice comes back as 24 kHz pcm16
 * (`response.audio.delta`) and is played as it arrives; on a video call a JPEG frame a second
 * goes out as `input_image_buffer.append`. The protocol is the provider's (OpenAI Realtime-
 * shaped) and the line is nanoMuse Cloud's `/v1/realtime` when signed in — the call is metered
 * there, kind `realtime` — or the provider's own socket when a Bailian key is configured.
 *
 * One engine per call. Everything here runs off the main thread; the screen follows the flows.
 */
class CallEngine(private val context: Context, video: Boolean) {
    /** Whether camera frames go out. Flipped mid-call by [setVideo]; the model is told it can see. */
    @Volatile var video: Boolean = video
        private set

    fun setVideo(on: Boolean) {
        if (video == on) return
        video = on
        if (!closed.get() && sentAudio.get()) send(sessionUpdate())
    }

    enum class Phase { CONNECTING, LISTENING, HEARING, THINKING, SPEAKING, ENDED, FAILED }

    data class Caption(val who: String, val text: String, val final: Boolean)

    private val _phase = MutableStateFlow(Phase.CONNECTING)
    val phase: StateFlow<Phase> = _phase.asStateFlow()
    private val _captions = MutableStateFlow<List<Caption>>(emptyList())
    val captions: StateFlow<List<Caption>> = _captions.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _costCny = MutableStateFlow(0.0)
    val costCny: StateFlow<Double> = _costCny.asStateFlow()
    private val _turns = MutableStateFlow(0)
    val turns: StateFlow<Int> = _turns.asStateFlow()
    /** 0..1 — the microphone while listening, the voice while speaking. */
    private val _level = MutableStateFlow(0f)
    val level: StateFlow<Float> = _level.asStateFlow()
    private val _muted = MutableStateFlow(false)
    val muted: StateFlow<Boolean> = _muted.asStateFlow()
    /** How the call is routed: "cloud", "own" — or "" before it is known. */
    var source: String = ""
        private set
    var model: String = ""
        private set
    val startedAt: Long = System.currentTimeMillis()

    private val http = sharedHttp
    private var socket: WebSocket? = null
    private val closed = AtomicBoolean(false)
    private val sentAudio = AtomicBoolean(false)
    private var mic: Thread? = null
    private var speaker: Speaker? = null
    private var lastFrameAt = 0L

    // ---------------------------------------------------------------- routing
    private class Route(val url: String, val key: String, val source: String, val model: String)

    private fun route(): Route? {
        val relayKey = NanoMuseCloud.apiKey(context)
        if (relayKey != null) {
            val base = NanoMuseCloud.baseUrl(context).replaceFirst("https://", "wss://").replaceFirst("http://", "ws://").trimEnd('/')
            // no model: the relay picks its recommended real-time model
            return Route("$base/v1/realtime", relayKey, "cloud", "")
        }
        val repo = (context.applicationContext as? MinisApp)?.providerRepositoryOrNull ?: return null
        for (inst in repo.instances) {
            val host = inst.customBaseURL.orEmpty()
            val intl = host.contains("dashscope-intl.aliyuncs.com")
            if (host.contains("dashscope.aliyuncs.com") || intl || host.contains("maas.qwencloudapi.com")) {
                val key = repo.loadApiKey(inst.id)?.takeIf { it.isNotBlank() } ?: continue
                val ws = if (intl) "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime" else "wss://dashscope.aliyuncs.com/api-ws/v1/realtime"
                return Route("$ws?model=$DEFAULT_MODEL", key, "own", DEFAULT_MODEL)
            }
        }
        return null
    }

    /** The same agent as the chat: its name, its SOUL.md, what USER.md says about the person. */
    private fun instructions(): String {
        val soul = runCatching { SoulStore.load(context) }.getOrNull()
        val name = soul?.metadata?.name?.takeIf { it.isNotBlank() } ?: SoulStore.cachedMetadata.value.name
        val body = soul?.body?.trim().orEmpty().take(3000)
        val user = runCatching { SystemFiles.USER.read(context).trim() }.getOrDefault("").take(1500)
        val kind = if (video) "video" else "voice"
        val sees = if (video) " and see what their camera shows" else ""
        return buildString {
            append("You are $name, the user's own personal agent, and this is a $kind call with them — you can hear them$sees.\n")
            append("Speak the way a close, capable friend does on the phone: natural, warm, concise. One to three sentences unless they ask for detail. Never read out lists or markdown; say things.\n")
            append("Answer in the language they speak to you in.\n")
            if (body.isNotEmpty()) append("\nWho you are:\n$body\n")
            if (user.isNotEmpty()) append("\nAbout them:\n$user\n")
            append("\nIf they ask you to do something that needs your tools (their phone's apps, files, other devices), say you will do it after the call and what you will do; you cannot use tools while on the line.")
        }
    }

    private fun sessionUpdate(): JSONObject = JSONObject().put("type", "session.update").put(
        "session",
        JSONObject()
            .put("modalities", JSONArray().put("text").put("audio"))
            .put("voice", DEFAULT_VOICE)
            .put("instructions", instructions())
            .put("input_audio_format", "pcm16")
            .put("output_audio_format", "pcm16")
            .put("input_audio_transcription", JSONObject().put("model", "gummy-realtime-v1"))
            .put(
                "turn_detection",
                JSONObject().put("type", "server_vad").put("threshold", 0.5).put("prefix_padding_ms", 300).put("silence_duration_ms", 700),
            ),
    )

    // ---------------------------------------------------------------- lifecycle
    /** Connect and start the microphone. Returns false (with [error] set) when there is no line. */
    fun start(): Boolean {
        val r = route()
        if (r == null) {
            _error.value = NO_ROUTE
            _phase.value = Phase.FAILED
            return false
        }
        source = r.source
        model = r.model
        speaker = Speaker().also { it.start() }
        val req = Request.Builder().url(r.url).header("Authorization", "Bearer ${r.key}").header("OpenAI-Beta", "realtime=v1").build()
        socket = http.newWebSocket(req, listener)
        return true
    }

    fun setMuted(on: Boolean) {
        _muted.value = on
    }

    /** One camera frame (JPEG, base64, no data-URL prefix). At most one a second; audio first. */
    fun sendFrame(jpegB64: String) {
        if (!video || !sentAudio.get() || closed.get()) return
        val now = System.currentTimeMillis()
        if (now - lastFrameAt < 1000) return
        lastFrameAt = now
        send(JSONObject().put("type", "input_image_buffer.append").put("image", jpegB64))
    }

    fun hangUp() {
        end(Phase.ENDED, null)
    }

    private fun end(phase: Phase, why: String?) {
        if (!closed.compareAndSet(false, true)) return
        if (why != null) _error.value = why
        else if (phase == Phase.ENDED) _error.value = null // hung up on purpose: no stale complaint
        mic?.interrupt()
        speaker?.stop()
        runCatching { socket?.cancel() }
        _phase.value = phase
        _level.value = 0f
    }

    private fun send(obj: JSONObject) {
        socket?.send(obj.toString())
    }

    // ---------------------------------------------------------------- the socket
    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            send(sessionUpdate())
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val obj = runCatching { JSONObject(text) }.getOrNull() ?: return
            handle(obj)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) = Unit

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (closed.get()) return
            val why = when (code) {
                4429 -> CAP
                4408 -> TOO_LONG
                4502 -> UNREACHABLE
                else -> if (_phase.value == Phase.CONNECTING) UNREACHABLE else null
            }
            end(if (why != null && _phase.value == Phase.CONNECTING) Phase.FAILED else Phase.ENDED, why ?: _error.value)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (closed.get()) return
            val why = when (response?.code) {
                401 -> BAD_KEY
                429 -> CAP
                else -> UNREACHABLE
            }
            end(Phase.FAILED, why)
        }
    }

    private fun handle(obj: JSONObject) {
        when (obj.optString("type")) {
            "session.created", "session.updated" -> if (_phase.value == Phase.CONNECTING) {
                _phase.value = Phase.LISTENING
                startMic()
            }
            "input_audio_buffer.speech_started" -> {
                speaker?.interrupt()
                _phase.value = Phase.HEARING
            }
            "input_audio_buffer.speech_stopped" -> _phase.value = Phase.THINKING
            "conversation.item.input_audio_transcription.completed" -> {
                val t = obj.optString("transcript").trim()
                if (t.isNotEmpty()) _captions.value = (_captions.value.filter { it.final } + Caption("you", t, true)).takeLast(6)
            }
            "response.created" -> if (_phase.value != Phase.SPEAKING) _phase.value = Phase.THINKING
            "response.audio_transcript.delta" -> {
                val d = obj.optString("delta")
                val c = _captions.value
                val last = c.lastOrNull()
                _captions.value = if (last != null && last.who == "muse" && !last.final) {
                    c.dropLast(1) + last.copy(text = last.text + d)
                } else {
                    (c + Caption("muse", d, false)).takeLast(6)
                }
            }
            "response.audio_transcript.done" -> {
                val t = obj.optString("transcript").trim()
                val c = _captions.value
                val last = c.lastOrNull()
                _captions.value = if (last != null && last.who == "muse" && !last.final) {
                    c.dropLast(1) + Caption("muse", t.ifEmpty { last.text }, true)
                } else if (t.isNotEmpty()) {
                    (c + Caption("muse", t, true)).takeLast(6)
                } else {
                    c
                }
            }
            "response.audio.delta" -> {
                speaker?.play(obj.optString("delta"))
                if (_phase.value != Phase.SPEAKING) _phase.value = Phase.SPEAKING
            }
            "response.done" -> {
                _turns.value += 1
                val nm = obj.optJSONObject("nanomuse")
                if (nm != null && nm.has("cost_cny")) _costCny.value += nm.optDouble("cost_cny", 0.0)
            }
            "error" -> {
                val e = obj.optJSONObject("error") ?: JSONObject()
                when (val code = e.optString("code")) {
                    "daily_cap", "out_of_tokens" -> _error.value = CAP
                    "call_too_long" -> _error.value = TOO_LONG
                    "upstream", "upstream_unconfigured", "upstream_busy", "upstream_auth", "upstream_model" -> _error.value = UNREACHABLE
                    else -> {
                        // anything else is the provider's own wording: logged, shown as "unreachable"
                        val m = e.optString("message")
                        if (m.isNotEmpty() && !m.contains("cancel", ignoreCase = true)) {
                            AppLogger.info(TAG, "call error $code: $m")
                            _error.value = UNREACHABLE
                        }
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------- the microphone
    private fun startMic() {
        if (mic != null) return
        mic = Thread({
            val minBuf = AudioRecord.getMinBufferSize(IN_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val rec = try {
                AudioRecord(
                    MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                    IN_RATE,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    maxOf(minBuf, IN_RATE * 2 / 5), // 200 ms
                )
            } catch (_: Throwable) {
                end(Phase.FAILED, MIC_REFUSED)
                return@Thread
            }
            if (rec.state != AudioRecord.STATE_INITIALIZED) {
                rec.release()
                end(Phase.FAILED, MIC_REFUSED)
                return@Thread
            }
            try {
                rec.startRecording()
                val chunk = ByteArray(IN_RATE * 2 / 25) // 40 ms
                val silence = ByteArray(chunk.size)
                while (!closed.get() && !Thread.currentThread().isInterrupted) {
                    val n = rec.read(chunk, 0, chunk.size)
                    if (n <= 0) continue
                    val muted = _muted.value
                    val out = if (muted) silence else chunk
                    if (_phase.value != Phase.SPEAKING) _level.value = if (muted) 0f else rms(chunk, n)
                    val b64 = Base64.encodeToString(out, 0, n, Base64.NO_WRAP)
                    send(JSONObject().put("type", "input_audio_buffer.append").put("audio", b64))
                    sentAudio.set(true)
                }
            } catch (_: Throwable) {
                // the socket closed under us, or the thread was interrupted
            } finally {
                runCatching { rec.stop() }
                rec.release()
            }
        }, "nanomuse-call-mic").also { it.start() }
    }

    private fun rms(buf: ByteArray, n: Int): Float {
        var acc = 0.0
        var i = 0
        while (i + 1 < n) {
            val s = ((buf[i + 1].toInt() shl 8) or (buf[i].toInt() and 0xff)).toShort().toInt()
            acc += (s * s).toDouble()
            i += 2
        }
        val r = sqrt(acc / (n / 2).coerceAtLeast(1)) / 32768.0
        return min(1.0, r * 6).toFloat()
    }

    /** The voice as it streams: 24 kHz pcm16, played as soon as it arrives; interruptible. */
    private inner class Speaker {
        private val queue = LinkedBlockingQueue<ByteArray>()
        private var track: AudioTrack? = null
        private var thread: Thread? = null
        private val written = AtomicLong(0)
        private val stopped = AtomicBoolean(false)

        fun start() {
            val minBuf = AudioTrack.getMinBufferSize(OUT_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            track = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder().setSampleRate(OUT_RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build(),
                )
                .setBufferSizeInBytes(maxOf(minBuf, OUT_RATE * 2)) // a second
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
                .also { it.play() }
            thread = Thread({
                while (!stopped.get()) {
                    val buf = try { queue.poll(200, TimeUnit.MILLISECONDS) } catch (_: InterruptedException) { break }
                    if (buf == null) {
                        // drained: the voice has finished, back to listening
                        if (_phase.value == Phase.SPEAKING && pending() <= 0.05) _phase.value = Phase.LISTENING
                        continue
                    }
                    val t = track ?: break
                    var off = 0
                    while (off < buf.size && !stopped.get()) {
                        val n = t.write(buf, off, buf.size - off)
                        if (n <= 0) break
                        off += n
                    }
                    written.addAndGet((buf.size / 2).toLong())
                    _level.value = rms(buf, buf.size)
                }
            }, "nanomuse-call-speaker").also { it.start() }
        }

        fun play(b64: String) {
            if (b64.isEmpty() || stopped.get()) return
            queue.offer(Base64.decode(b64, Base64.NO_WRAP))
        }

        /** Seconds of voice still to be heard. */
        fun pending(): Double {
            val t = track ?: return 0.0
            val head = t.playbackHeadPosition.toLong() and 0xffffffffL
            val queued = queue.sumOf { it.size / 2 }
            return ((written.get() - head).coerceAtLeast(0) + queued).toDouble() / OUT_RATE
        }

        /** The person started talking over the voice: drop what has not been heard yet. */
        fun interrupt() {
            queue.clear()
            val t = track ?: return
            runCatching {
                t.pause()
                t.flush()
                t.play()
            }
            written.set(0)
        }

        fun stop() {
            stopped.set(true)
            thread?.interrupt()
            queue.clear()
            runCatching { track?.stop() }
            runCatching { track?.release() }
            track = null
        }
    }

    companion object {
        private const val TAG = "CallEngine"

        /** One client for every call: a new one per call kept its threads and pool alive after hang-up. */
        private val sharedHttp: OkHttpClient by lazy {
            OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).pingInterval(20, TimeUnit.SECONDS).build()
        }

        const val IN_RATE = 16_000
        const val OUT_RATE = 24_000
        const val DEFAULT_MODEL = "qwen3.5-omni-flash-realtime"
        const val DEFAULT_VOICE = "Cherry"

        // Stable reasons the screen turns into sentences.
        const val NO_ROUTE = "no_route"
        const val CAP = "daily_cap"
        const val TOO_LONG = "call_too_long"
        const val UNREACHABLE = "unreachable"
        const val BAD_KEY = "bad_key"
        const val MIC_REFUSED = "mic_refused"
    }
}
