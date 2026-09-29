package io.github.nanomuse.ui.onboarding

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.Accessibility
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.TouchApp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.openminis.app.R
import io.github.nanomuse.hands.Hands
import io.github.nanomuse.ui.avatar.AgentAvatarDisc
import io.github.nanomuse.ui.avatar.AgentMood
import io.github.nanomuse.ui.home.MuseTones

/**
 * nanoMuse's first run: a few full pages in Muse's shape, one blue pill each.
 *
 * 1. **Welcome** — the face, what it is, and the notice that matters most: free, open-source,
 *    non-profit, and what signing in gives. *Sign in with e-mail* is the door most people take
 *    ([io.github.nanomuse.cloud.NanoMuseCloud], the relay becomes a provider with a default
 *    model in one go); *I have my own API key* is the other, OpenMinis' provider screen.
 * 2. **Models** — only on the own-key path, when the provider has no model group yet
 *    (`OnboardingModelSelectionScreen`); skippable.
 * 3. **Hands** — the two permissions the phone needs before the agent can use its apps
 *    (accessibility, drawing over other apps). Asked once, up front, and skippable: everything
 *    else works without them, and *Settings → Hands* has them later.
 * 4. **Meet the agent** — the hand-off into the first conversation.
 *
 * [io.github.nanomuse.ui.home.NanoMuseHome] shows this instead of the chat until the app has a
 * model to talk to and *Start* has been tapped.
 */
object FirstRunSetup {
    private const val PREFS = "nanomuse"
    private const val KEY_DONE = "setup.done"
    private const val KEY_HANDS_SEEN = "setup.hands_seen"

    fun isDone(context: Context): Boolean = prefs(context).getBoolean(KEY_DONE, false)
    fun markDone(context: Context) { prefs(context).edit().putBoolean(KEY_DONE, true).apply() }

    /** Whether the Hands permission page has been answered (granted or skipped). */
    fun handsGuideSeen(context: Context): Boolean = prefs(context).getBoolean(KEY_HANDS_SEEN, false)
    fun markHandsGuideSeen(context: Context) { prefs(context).edit().putBoolean(KEY_HANDS_SEEN, true).apply() }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * Whether the home should show the setup instead of the chat. No provider means the chat
     * cannot answer, so the setup always comes back then. Otherwise it stays only for a brand-new
     * install — no conversation yet — until *Start* has been tapped, so the last page is a real
     * step and the hand-off into the first conversation is deliberate.
     */
    fun needed(hasProviders: Boolean, hasSessions: Boolean, done: Boolean): Boolean =
        !hasProviders || (!hasSessions && !done)

    enum class Stage { WELCOME, MODELS, HANDS, MEET }

    /** The page to show, from what the app has. */
    fun stage(
        hasProviders: Boolean,
        hasGroups: Boolean,
        modelsSkipped: Boolean,
        handsSeen: Boolean,
        handsPossible: Boolean = Build.VERSION.SDK_INT >= Hands.MIN_SDK,
    ): Stage = when {
        !hasProviders -> Stage.WELCOME
        !hasGroups && !modelsSkipped -> Stage.MODELS
        !handsSeen && handsPossible -> Stage.HANDS
        else -> Stage.MEET
    }

    /** The dot that lights for a stage: connect · phone · meet (models fold into the first). */
    fun dot(stage: Stage): Int = when (stage) {
        Stage.WELCOME, Stage.MODELS -> 0
        Stage.HANDS -> 1
        Stage.MEET -> 2
    }
}

private const val PRIVACY_URL = "https://github.com/nano-muse/nanoMuse/blob/main/docs/privacy.md"

@Composable
fun FirstRunSetupScreen(
    agentName: String,
    hasProviders: Boolean,
    hasGroups: Boolean,
    onAddProvider: () -> Unit,
    onSelectModels: () -> Unit,
    onStart: () -> Unit,
    onSettings: () -> Unit,
    onStartNow: () -> Unit = onAddProvider,
) {
    val context = LocalContext.current
    var modelsSkipped by remember { mutableStateOf(false) }
    var handsSeen by remember { mutableStateOf(FirstRunSetup.handsGuideSeen(context)) }
    val stage = FirstRunSetup.stage(hasProviders, hasGroups, modelsSkipped, handsSeen)
    val onSurface = MaterialTheme.colorScheme.onSurface

    Surface(color = MuseTones.surface, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
        ) {
            // Muse keeps a gear at the top right of its welcome screen; ours opens Settings,
            // where every OpenMinis page (providers, groups, appearance) is reachable anyway.
            Box(modifier = Modifier.fillMaxWidth().height(56.dp)) {
                Dots(current = FirstRunSetup.dot(stage), total = 3, modifier = Modifier.align(Alignment.Center))
                IconButton(onClick = onSettings, modifier = Modifier.align(Alignment.CenterEnd).padding(end = 8.dp)) {
                    Icon(Icons.Outlined.Settings, contentDescription = stringResource(R.string.nm_setup_settings), tint = onSurface)
                }
            }
            AnimatedContent(
                targetState = stage,
                transitionSpec = {
                    val forward = targetState.ordinal >= initialState.ordinal
                    (slideInHorizontally(tween(260)) { if (forward) it / 6 else -it / 6 } + fadeIn(tween(220))) togetherWith
                        (slideOutHorizontally(tween(200)) { if (forward) -it / 6 else it / 6 } + fadeOut(tween(160)))
                },
                label = "nmSetupStage",
                modifier = Modifier.weight(1f),
            ) { current ->
                when (current) {
                    FirstRunSetup.Stage.WELCOME -> WelcomePage(onStartNow = onStartNow, onOwnKey = onAddProvider)
                    FirstRunSetup.Stage.MODELS -> ModelsPage(onSelectModels = onSelectModels, onSkip = { modelsSkipped = true })
                    FirstRunSetup.Stage.HANDS -> HandsPage(
                        onDone = { FirstRunSetup.markHandsGuideSeen(context); handsSeen = true },
                    )
                    FirstRunSetup.Stage.MEET -> MeetPage(agentName = agentName, onStart = onStart)
                }
            }
        }
    }
}

// ── the pages ──────────────────────────────────────────────────────────────

/** The first page: the face, one line on what it is, the notice, and the two doors. */
@Composable
private fun WelcomePage(onStartNow: () -> Unit, onOwnKey: () -> Unit) {
    val context = LocalContext.current
    Page(
        hero = { AgentAvatarDisc(mood = AgentMood.IDLE, discSize = 104.dp) },
        title = stringResource(R.string.nm_setup_title),
        subtitle = stringResource(R.string.nm_welcome_tagline),
        primaryLabel = stringResource(R.string.nm_welcome_email),
        onPrimary = onStartNow,
        secondaryLabel = stringResource(R.string.nm_setup_own_key),
        onSecondary = onOwnKey,
        finePrint = stringResource(R.string.nm_welcome_fine_print),
        onLearnMore = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL))) },
    ) {
        FeatureRow(Icons.Outlined.ChatBubbleOutline, stringResource(R.string.nm_welcome_feat_chat), stringResource(R.string.nm_welcome_feat_chat_sub))
        Spacer(Modifier.height(10.dp))
        FeatureRow(Icons.Outlined.TouchApp, stringResource(R.string.nm_welcome_feat_hands), stringResource(R.string.nm_welcome_feat_hands_sub))
        Spacer(Modifier.height(10.dp))
        FeatureRow(Icons.Outlined.Computer, stringResource(R.string.nm_welcome_feat_reach), stringResource(R.string.nm_welcome_feat_reach_sub))
        Spacer(Modifier.height(18.dp))
        NoticeCard(title = stringResource(R.string.nm_cloud_notice_title), body = stringResource(R.string.nm_welcome_notice))
    }
}

/** Own-key path only: the provider is there, its models are not chosen yet. */
@Composable
private fun ModelsPage(onSelectModels: () -> Unit, onSkip: () -> Unit) {
    Page(
        hero = { HeroGlyph(Icons.Outlined.AutoAwesome) },
        title = stringResource(R.string.nm_setup_step_models),
        subtitle = stringResource(R.string.nm_setup_step_models_sub),
        primaryLabel = stringResource(R.string.nm_setup_continue),
        onPrimary = onSelectModels,
        secondaryLabel = stringResource(R.string.nm_setup_skip_models),
        onSecondary = onSkip,
        finePrint = stringResource(R.string.nm_setup_fine_print),
    )
}

/**
 * The two permissions Hands needs, up front and skippable. Each row shows where it stands and
 * opens the right settings page; the state is re-read when the user comes back. *Continue* with
 * both in place also flips the Hands switch on, so the agent can use the phone straight away.
 */
@Composable
private fun HandsPage(onDone: () -> Unit) {
    val context = LocalContext.current
    var tick by remember { mutableIntStateOf(0) }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_RESUME) tick++ }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    val readiness = remember(tick) { Hands.readiness(context) }
    val allSet = readiness.serviceOn && readiness.overlayOk

    Page(
        hero = { HeroGlyph(Icons.Outlined.TouchApp) },
        title = stringResource(R.string.nm_welcome_hands_title),
        subtitle = stringResource(R.string.nm_welcome_hands_sub),
        primaryLabel = if (allSet) stringResource(R.string.nm_setup_continue) else stringResource(R.string.nm_welcome_hands_turn_on),
        onPrimary = {
            when {
                allSet -> { Hands.setEnabled(context, true); onDone() }
                !readiness.serviceOn -> openAccessibilitySettings(context)
                else -> openOverlaySettings(context)
            }
        },
        secondaryLabel = if (allSet) null else stringResource(R.string.nm_welcome_skip),
        onSecondary = onDone,
        finePrint = stringResource(R.string.nm_welcome_hands_fine_print),
    ) {
        PermissionRow(
            icon = Icons.Outlined.Accessibility,
            title = stringResource(R.string.nm_hands_need_a11y),
            subtitle = stringResource(R.string.nm_hands_need_a11y_fix),
            ok = readiness.serviceOn,
            okLabel = stringResource(R.string.nm_hands_need_on),
            onFix = { openAccessibilitySettings(context) },
        )
        Spacer(Modifier.height(10.dp))
        PermissionRow(
            icon = Icons.Outlined.Layers,
            title = stringResource(R.string.nm_hands_need_overlay),
            subtitle = stringResource(R.string.nm_hands_need_overlay_fix),
            ok = readiness.overlayOk,
            okLabel = stringResource(R.string.nm_hands_need_granted),
            onFix = { openOverlaySettings(context) },
        )
    }
}

/** The last page: the face again, and the hand-off into the first conversation. */
@Composable
private fun MeetPage(agentName: String, onStart: () -> Unit) {
    Page(
        hero = { AgentAvatarDisc(mood = AgentMood.IDLE, discSize = 104.dp) },
        title = stringResource(R.string.nm_setup_step_start, agentName),
        subtitle = stringResource(R.string.nm_setup_step_start_sub),
        primaryLabel = stringResource(R.string.nm_setup_start),
        onPrimary = onStart,
        finePrint = stringResource(R.string.nm_welcome_meet_fine_print),
    )
}

// ── the shape of a page ────────────────────────────────────────────────────

/** Hero, title, one line under it, the page's own rows, then the pill(s) and the fine print. */
@Composable
private fun Page(
    hero: @Composable () -> Unit,
    title: String,
    subtitle: String,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryLabel: String? = null,
    onSecondary: () -> Unit = {},
    finePrint: String? = null,
    onLearnMore: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit = {},
) {
    val onSurface = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(12.dp))
            hero()
            Spacer(Modifier.height(20.dp))
            Text(
                text = title,
                fontSize = 24.sp,
                lineHeight = 30.sp,
                fontWeight = FontWeight.SemiBold,
                color = onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = subtitle,
                fontSize = 14.5.sp,
                lineHeight = 21.sp,
                color = muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp),
            )
            Spacer(Modifier.height(24.dp))
            content()
            Spacer(Modifier.height(20.dp))
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Button(
                onClick = onPrimary,
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(containerColor = MuseTones.action, contentColor = Color.White),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) {
                Text(primaryLabel, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            }
            if (secondaryLabel != null) {
                TextButton(onClick = onSecondary) { Text(secondaryLabel, color = MuseTones.action, fontSize = 14.sp) }
            } else {
                Spacer(Modifier.height(12.dp))
            }
            if (finePrint != null) {
                Text(
                    text = finePrint,
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    color = muted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
            }
            if (onLearnMore != null) {
                TextButton(
                    onClick = onLearnMore,
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp),
                    modifier = Modifier.height(28.dp),
                ) {
                    Text(stringResource(R.string.nm_setup_learn_more), color = MuseTones.action, fontSize = 12.sp)
                }
            }
        }
    }
}

/** The page indicator: three small dots, the current one in the action blue and a little longer. */
@Composable
private fun Dots(current: Int, total: Int, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(total) { i ->
            Box(
                Modifier
                    .height(6.dp)
                    .width(if (i == current) 18.dp else 6.dp)
                    .clip(CircleShape)
                    .background(if (i == current) MuseTones.action else MuseTones.hairline),
            )
        }
    }
}

/** A glyph on the pale disc, where the face would be. */
@Composable
private fun HeroGlyph(icon: ImageVector) {
    Box(
        modifier = Modifier.size(104.dp).clip(CircleShape).background(MuseTones.disc),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = MuseTones.action, modifier = Modifier.size(44.dp))
    }
}

/** One thing the agent does: glyph, a title, a line under it. */
@Composable
private fun FeatureRow(icon: ImageVector, title: String, subtitle: String) {
    val onSurface = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier.size(40.dp).clip(CircleShape).background(MuseTones.fill),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = onSurface, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = onSurface)
            Text(subtitle, fontSize = 13.sp, lineHeight = 17.sp, color = muted)
        }
    }
}

/** A permission with where it stands: a green tick and its state, or a *Set up* pill. */
@Composable
private fun PermissionRow(icon: ImageVector, title: String, subtitle: String, ok: Boolean, okLabel: String, onFix: () -> Unit) {
    val onSurface = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        onClick = onFix,
        enabled = !ok,
        shape = RoundedCornerShape(16.dp),
        color = MuseTones.fill,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Icon(icon, contentDescription = null, tint = onSurface, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = onSurface)
                Text(subtitle, fontSize = 13.sp, lineHeight = 17.sp, color = muted)
            }
            Spacer(Modifier.width(10.dp))
            if (ok) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.size(20.dp).clip(CircleShape).background(Color(0xFF2E9E5B)),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(13.dp)) }
                    Spacer(Modifier.width(6.dp))
                    Text(okLabel, fontSize = 13.sp, color = muted)
                }
            } else {
                Text(stringResource(R.string.nm_hands_need_set_up), fontSize = 14.sp, fontWeight = FontWeight.Medium, color = MuseTones.action)
            }
        }
    }
}

/** The notice: a title line and a paragraph, on the grey pill fill so it reads as a card. */
@Composable
private fun NoticeCard(title: String, body: String) {
    val onSurface = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Surface(shape = RoundedCornerShape(16.dp), color = MuseTones.fill, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = onSurface)
            Text(body, fontSize = 13.sp, lineHeight = 18.sp, color = muted, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

// ── the settings pages the permissions live on ─────────────────────────────

private fun openAccessibilitySettings(context: Context) {
    try {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Throwable) {
        runCatching { context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}

private fun openOverlaySettings(context: Context) {
    try {
        context.startActivity(
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    } catch (_: Throwable) {
        runCatching { context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}
