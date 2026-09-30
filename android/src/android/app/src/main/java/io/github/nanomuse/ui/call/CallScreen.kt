package io.github.nanomuse.ui.call

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Base64
import android.util.Size
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.MicOff
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material.icons.outlined.VideocamOff
import androidx.compose.material.icons.outlined.Call
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.openminis.app.R
import com.openminis.app.agent.SoulStore
import io.github.nanomuse.call.CallEngine
import io.github.nanomuse.ui.avatar.AgentAvatar
import io.github.nanomuse.ui.avatar.AgentMood
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

const val ROUTE_CALL = "nanomuse/call/{video}"
fun callRoute(video: Boolean) = "nanomuse/call/${if (video) 1 else 0}"

private val Night = Color(0xFF0B0D14)
private val Ink = Color(0xFFF4F5F8)
private val Muted = Color(0xFF8B90A0)
private val Blue = Color(0xFF3B82F6)
private val Green = Color(0xFF34C759)
private val Red = Color(0xFFFF453A)

/**
 * A call with the Muse: the face on a dark stage, rings that breathe with the voice, what was
 * said in captions, the controls a phone call has. On a video call the camera is the backdrop.
 * Permissions first, then the line (docs/calls.md).
 */
@Composable
fun CallScreen(video: Boolean, onDone: () -> Unit) {
    val context = LocalContext.current
    val soul by SoulStore.cachedMetadata.collectAsState()
    val name = soul.name.trim().ifEmpty { stringResource(R.string.app_name) }
    var camera by remember { mutableStateOf(video) }
    var engine by remember { mutableStateOf<CallEngine?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var permissionDenied by remember { mutableStateOf(false) }

    val needed = remember(camera) { listOfNotNull(Manifest.permission.RECORD_AUDIO, if (camera) Manifest.permission.CAMERA else null) }
    fun granted(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        if (result[Manifest.permission.RECORD_AUDIO] == true) {
            if (result[Manifest.permission.CAMERA] == false) camera = false
            attempt += 1
        } else {
            permissionDenied = true
        }
    }

    // The line: opened once the microphone is allowed; a new attempt after "Call again".
    LaunchedEffect(attempt) {
        engine?.hangUp()
        engine = null
        if (!granted(Manifest.permission.RECORD_AUDIO)) {
            ask.launch(needed.toTypedArray())
            return@LaunchedEffect
        }
        val e = CallEngine(context, video = camera)
        engine = e
        e.start()
    }
    DisposableEffect(Unit) { onDispose { engine?.hangUp() } }
    // The camera switched on or off during the call: the engine starts or stops sending frames.
    LaunchedEffect(camera, engine) { engine?.setVideo(camera && granted(Manifest.permission.CAMERA)) }
    // The screen stays on for the call (as a phone's dialer does), and comes back to normal after.
    val callView = LocalView.current
    DisposableEffect(callView) {
        callView.keepScreenOn = true
        onDispose { callView.keepScreenOn = false }
    }
    BackHandler { engine?.hangUp(); onDone() }

    val e = engine
    val phase by (e?.phase ?: remember { kotlinx.coroutines.flow.MutableStateFlow(CallEngine.Phase.CONNECTING) }).collectAsState()
    val captions by (e?.captions ?: remember { kotlinx.coroutines.flow.MutableStateFlow(emptyList<CallEngine.Caption>()) }).collectAsState()
    val error by (e?.error ?: remember { kotlinx.coroutines.flow.MutableStateFlow<String?>(null) }).collectAsState()
    val cost by (e?.costCny ?: remember { kotlinx.coroutines.flow.MutableStateFlow(0.0) }).collectAsState()
    val muted by (e?.muted ?: remember { kotlinx.coroutines.flow.MutableStateFlow(false) }).collectAsState()
    val rawLevel by (e?.level ?: remember { kotlinx.coroutines.flow.MutableStateFlow(0f) }).collectAsState()
    val level by animateFloatAsState(targetValue = rawLevel, animationSpec = tween(120), label = "level")
    val done = phase == CallEngine.Phase.ENDED || phase == CallEngine.Phase.FAILED

    var seconds by remember { mutableIntStateOf(0) }
    LaunchedEffect(e, done) {
        while (!done && e != null) {
            seconds = ((System.currentTimeMillis() - e.startedAt) / 1000).toInt()
            delay(500)
        }
    }

    Box(Modifier.fillMaxSize().background(Night)) {
        if (camera && !done && phase != CallEngine.Phase.CONNECTING && e != null && granted(Manifest.permission.CAMERA)) {
            CameraFeed(engine = e, modifier = Modifier.fillMaxSize())
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Night.copy(alpha = 0.55f), Color.Transparent, Night.copy(alpha = 0.85f)))))
        } else {
            Backdrop(phase = phase, level = level)
        }

        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
            // -- the line ---------------------------------------------------------------------
            Spacer(Modifier.height(14.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.08f)).padding(horizontal = 14.dp, vertical = 7.dp),
            ) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(if (done) Muted else if (phase == CallEngine.Phase.CONNECTING) Color(0xFFF5A524) else Green))
                Spacer(Modifier.width(8.dp))
                Text(text = clock(seconds), color = Ink, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                if (cost > 0) {
                    Text(text = "  ·  ¥" + String.format(java.util.Locale.US, if (cost < 1) "%.3f" else "%.2f", cost), color = Muted, fontSize = 13.sp)
                }
                if (e != null && e.source.isNotEmpty()) {
                    Text(
                        text = "  ·  " + stringResource(if (e.source == "cloud") R.string.nm_cloud_title else R.string.nm_call_own_key),
                        color = Muted,
                        fontSize = 13.sp,
                    )
                }
            }

            Spacer(Modifier.weight(1f))

            // -- the face ---------------------------------------------------------------------
            val mood = when (phase) {
                CallEngine.Phase.HEARING -> AgentMood.WAITING
                CallEngine.Phase.THINKING -> AgentMood.WORKING
                CallEngine.Phase.SPEAKING -> AgentMood.HAPPY
                CallEngine.Phase.FAILED -> AgentMood.ERROR
                else -> AgentMood.IDLE
            }
            val discSize = if (camera && !done) 96.dp else 168.dp
            Box(contentAlignment = Alignment.Center, modifier = Modifier.size(discSize + 120.dp)) {
                Rings(phase = phase, level = level, base = discSize)
                Box(Modifier.size(discSize).clip(CircleShape).background(Color(0xFFF1EFEB)), contentAlignment = Alignment.Center) {
                    AgentAvatar(mood = mood, size = discSize, contentDescription = name)
                }
            }
            Spacer(Modifier.height(22.dp))
            Text(text = name, color = Ink, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text(
                text = statusText(phase, muted, error, permissionDenied),
                color = if (phase == CallEngine.Phase.FAILED) Red.copy(alpha = 0.9f) else Muted,
                fontSize = 15.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 32.dp),
            )

            Spacer(Modifier.weight(1f))

            // -- captions ---------------------------------------------------------------------
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 28.dp).height(96.dp),
                verticalArrangement = Arrangement.Bottom,
            ) {
                captions.takeLast(2).forEach { c ->
                    Text(
                        text = c.text,
                        color = if (c.who == "you") Muted else Ink,
                        fontSize = if (c.who == "you") 14.sp else 16.sp,
                        lineHeight = if (c.who == "you") 20.sp else 23.sp,
                        maxLines = if (c.who == "you") 1 else 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(vertical = 3.dp).alpha(if (c.final || c.who == "muse") 1f else 0.7f),
                    )
                }
            }
            Spacer(Modifier.height(28.dp))

            // -- controls ---------------------------------------------------------------------
            if (!done) {
                Row(horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
                    RoundControl(
                        icon = if (muted) Icons.Outlined.MicOff else Icons.Outlined.Mic,
                        label = stringResource(if (muted) R.string.nm_call_unmute else R.string.nm_call_mute),
                        active = muted,
                        onClick = { e?.setMuted(!muted) },
                    )
                    RoundControl(
                        icon = Icons.Filled.CallEnd,
                        label = stringResource(R.string.nm_call_hang_up),
                        tint = Red,
                        big = true,
                        onClick = { e?.hangUp() },
                    )
                    RoundControl(
                        icon = if (camera) Icons.Outlined.Videocam else Icons.Outlined.VideocamOff,
                        label = stringResource(if (camera) R.string.nm_call_camera_off else R.string.nm_call_camera_on),
                        active = camera,
                        onClick = {
                            if (!camera && !granted(Manifest.permission.CAMERA)) {
                                camera = true
                                ask.launch(arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA))
                            } else {
                                camera = !camera
                            }
                        },
                    )
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(28.dp), verticalAlignment = Alignment.CenterVertically) {
                    RoundControl(
                        icon = Icons.Outlined.Call,
                        label = stringResource(R.string.nm_call_again),
                        tint = Green,
                        onClick = { permissionDenied = false; attempt += 1 },
                    )
                    RoundControl(
                        icon = Icons.Filled.CallEnd,
                        label = stringResource(R.string.nm_call_done),
                        active = true,
                        onClick = onDone,
                    )
                }
            }
            Spacer(Modifier.height(36.dp))
        }
    }
}

private fun clock(s: Int): String = String.format(java.util.Locale.US, "%02d:%02d", s / 60, s % 60)

@Composable
private fun statusText(phase: CallEngine.Phase, muted: Boolean, error: String?, permissionDenied: Boolean): String = when {
    permissionDenied -> stringResource(R.string.nm_call_mic_refused)
    phase == CallEngine.Phase.FAILED || (phase == CallEngine.Phase.ENDED && error != null) -> when (error) {
        CallEngine.NO_ROUTE -> stringResource(R.string.nm_call_no_route)
        CallEngine.CAP -> stringResource(R.string.nm_call_cap)
        CallEngine.TOO_LONG -> stringResource(R.string.nm_call_too_long)
        CallEngine.UNREACHABLE -> stringResource(R.string.nm_call_unreachable)
        CallEngine.BAD_KEY -> stringResource(R.string.nm_cloud_err_bad_key)
        CallEngine.MIC_REFUSED -> stringResource(R.string.nm_call_mic_refused)
        null -> stringResource(R.string.nm_call_ended)
        else -> error
    }
    phase == CallEngine.Phase.CONNECTING -> stringResource(R.string.nm_call_connecting)
    phase == CallEngine.Phase.LISTENING -> stringResource(if (muted) R.string.nm_call_muted else R.string.nm_call_listening)
    phase == CallEngine.Phase.HEARING -> stringResource(R.string.nm_call_hearing)
    phase == CallEngine.Phase.THINKING -> stringResource(R.string.nm_call_thinking)
    phase == CallEngine.Phase.SPEAKING -> stringResource(R.string.nm_call_speaking)
    else -> stringResource(R.string.nm_call_ended)
}

/** Two soft blobs behind the face that brighten with the voice. Drawn once a frame, no blur. */
@Composable
private fun Backdrop(phase: CallEngine.Phase, level: Float) {
    val drift = rememberInfiniteTransition(label = "drift")
    val t by drift.animateFloat(0f, 1f, infiniteRepeatable(tween(9000), RepeatMode.Reverse), label = "t")
    val accent = when (phase) {
        CallEngine.Phase.HEARING -> Green
        CallEngine.Phase.SPEAKING -> Blue
        CallEngine.Phase.THINKING -> Color(0xFF8B5CF6)
        else -> Color(0xFF3F4A6B)
    }
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        val glow = 0.22f + level * 0.35f
        drawCircle(
            brush = Brush.radialGradient(listOf(accent.copy(alpha = glow), Color.Transparent), center = androidx.compose.ui.geometry.Offset(w * (0.3f + 0.15f * t), h * (0.35f + 0.05f * t)), radius = w * 0.55f),
            radius = w * 0.55f,
            center = androidx.compose.ui.geometry.Offset(w * (0.3f + 0.15f * t), h * (0.35f + 0.05f * t)),
        )
        drawCircle(
            brush = Brush.radialGradient(listOf(Color(0xFF1E2A55).copy(alpha = 0.5f), Color.Transparent), center = androidx.compose.ui.geometry.Offset(w * (0.75f - 0.1f * t), h * 0.7f), radius = w * 0.6f),
            radius = w * 0.6f,
            center = androidx.compose.ui.geometry.Offset(w * (0.75f - 0.1f * t), h * 0.7f),
        )
    }
}

/** Rings around the face: they grow with the voice (blue) or the person's (green). */
@Composable
private fun Rings(phase: CallEngine.Phase, level: Float, base: androidx.compose.ui.unit.Dp) {
    val breathe = rememberInfiniteTransition(label = "breathe")
    val b by breathe.animateFloat(0f, 1f, infiniteRepeatable(tween(2400), RepeatMode.Reverse), label = "b")
    val color = when (phase) {
        CallEngine.Phase.SPEAKING -> Blue
        CallEngine.Phase.HEARING -> Green
        CallEngine.Phase.THINKING -> Color(0xFF8B5CF6)
        CallEngine.Phase.CONNECTING -> Color(0xFFF5A524)
        else -> Color.White
    }
    val live = phase == CallEngine.Phase.SPEAKING || phase == CallEngine.Phase.HEARING
    Canvas(Modifier.size(base + 120.dp)) {
        val c = center
        val r0 = base.toPx() / 2
        val amp = if (live) level else 0.08f * b
        // three rings: the nearest follows the sound, the outer two lag and fade
        for (i in 0 until 3) {
            val grow = amp * (18f + i * 14f).dp.toPx() * (1f - i * 0.2f)
            val radius = r0 + (10 + i * 12).dp.toPx() + grow
            drawCircle(
                color = color.copy(alpha = (if (live) 0.55f else 0.28f) / (i + 1)),
                radius = radius,
                center = c,
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = (2f - i * 0.5f).dp.toPx()),
            )
        }
        if (phase == CallEngine.Phase.THINKING) {
            // a short arc that turns while it thinks
            drawArc(
                color = color,
                startAngle = -90f + b * 360f,
                sweepAngle = 70f,
                useCenter = false,
                topLeft = androidx.compose.ui.geometry.Offset(c.x - r0 - 10.dp.toPx(), c.y - r0 - 10.dp.toPx()),
                size = androidx.compose.ui.geometry.Size((r0 + 10.dp.toPx()) * 2, (r0 + 10.dp.toPx()) * 2),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round),
            )
        }
    }
}

@Composable
private fun RoundControl(icon: ImageVector, label: String, onClick: () -> Unit, tint: Color? = null, active: Boolean = false, big: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .size(if (big) 72.dp else 60.dp)
                .clip(CircleShape)
                .background(tint ?: if (active) Color.White else Color.White.copy(alpha = 0.12f))
                .clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = label, tint = if (tint != null) Color.White else if (active) Night else Ink, modifier = Modifier.size(if (big) 30.dp else 24.dp))
        }
        Spacer(Modifier.height(8.dp))
        Text(text = label, color = Muted, fontSize = 12.sp)
    }
}

/** The front camera as the backdrop; one small JPEG a second to the model. */
@Composable
private fun CameraFeed(engine: CallEngine, modifier: Modifier) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val view = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val scope = rememberCoroutineScope()
    DisposableEffect(engine) {
        val executor = Executors.newSingleThreadExecutor()
        var provider: ProcessCameraProvider? = null
        val job = scope.launch {
            val p = runCatching { ProcessCameraProvider.awaitInstance(context) }.getOrNull() ?: return@launch
            provider = p
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(
                    ResolutionSelector.Builder().setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)).build(),
                )
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build()
            var last = 0L
            analysis.setAnalyzer(executor) { image ->
                try {
                    val now = System.currentTimeMillis()
                    if (now - last >= 1000) {
                        last = now
                        var bmp = image.toBitmap()
                        val deg = image.imageInfo.rotationDegrees
                        if (deg != 0) bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(deg.toFloat()) }, true)
                        val longest = maxOf(bmp.width, bmp.height)
                        if (longest > 640) {
                            val k = 640f / longest
                            bmp = Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt().coerceAtLeast(1), (bmp.height * k).toInt().coerceAtLeast(1), true)
                        }
                        val out = ByteArrayOutputStream()
                        bmp.compress(Bitmap.CompressFormat.JPEG, 60, out)
                        engine.sendFrame(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP))
                    }
                } finally {
                    image.close()
                }
            }
            runCatching {
                p.unbindAll()
                p.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis)
            }
        }
        onDispose {
            job.cancel()
            runCatching { provider?.unbindAll() }
            executor.shutdown()
        }
    }
    AndroidView(factory = { view }, modifier = modifier)
}
