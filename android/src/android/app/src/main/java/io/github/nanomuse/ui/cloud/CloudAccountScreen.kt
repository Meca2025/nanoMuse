package io.github.nanomuse.ui.cloud

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.openminis.app.R
import io.github.nanomuse.cloud.NanoMuseCloud
import io.github.nanomuse.ui.home.MuseTones
import io.github.nanomuse.ui.muse.MuseCard
import io.github.nanomuse.ui.muse.MuseGap
import io.github.nanomuse.ui.muse.MuseRow
import io.github.nanomuse.ui.muse.MuseRowDivider
import io.github.nanomuse.ui.muse.MuseTopAppBar
import kotlinx.coroutines.launch
import java.text.NumberFormat

/**
 * Settings → nanoMuse Cloud. Who is signed in (the hint, never the number), how much of the
 * starter allowance is left, today's use against the daily cap, the provider's own pages, and
 * the way out: signing out revokes this phone's key at the relay and removes the provider.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CloudAccountScreen(
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    onOpenProvider: (instanceId: String) -> Unit,
    onOpenModelGroups: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var account by remember { mutableStateOf(NanoMuseCloud.account(context)) }
    var signedIn by remember { mutableStateOf(NanoMuseCloud.isSignedIn(context)) }
    var refreshing by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val numbers = remember { NumberFormat.getIntegerInstance() }

    fun refresh() {
        if (refreshing) return
        refreshing = true
        error = null
        scope.launch {
            try {
                account = NanoMuseCloud.refresh(context)
                signedIn = NanoMuseCloud.isSignedIn(context)
            } catch (e: Exception) {
                error = NanoMuseCloud.describe(context, e)
            }
            refreshing = false
        }
    }
    LaunchedEffect(Unit) { if (signedIn) refresh() }

    Scaffold(
        containerColor = MuseTones.canvas,
        topBar = {
            MuseTopAppBar(
                title = { Text(stringResource(R.string.nm_cloud_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.settings_back))
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            Spacer(Modifier.height(8.dp))
            if (!signedIn) {
                MuseCard {
                    Column(Modifier.padding(16.dp)) {
                        Text(stringResource(R.string.nm_cloud_not_signed_in), style = MaterialTheme.typography.titleMedium)
                        Text(
                            stringResource(R.string.nm_cloud_not_signed_in_sub),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    MuseRowDivider(inset = 16.dp)
                    MuseRow(title = stringResource(R.string.nm_cloud_sign_in), onClick = onSignIn, titleColor = MuseTones.action)
                }
            } else {
                val a = account
                MuseCard {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            text = a?.hint ?: stringResource(R.string.nm_cloud_title),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = when (a?.channel) {
                                "phone" -> stringResource(R.string.nm_cloud_channel_phone)
                                "email" -> stringResource(R.string.nm_cloud_channel_email)
                                else -> ""
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        if (a != null && a.pricesInMoney) {
                            // The relay prices requests in money: today's spend against the
                            // daily allowance in both currencies, the total, the token line.
                            Spacer(Modifier.height(16.dp))
                            Row(Modifier.fillMaxWidth()) {
                                Text(
                                    text = stringResource(R.string.nm_cloud_spent_today, money(a.spentTodayCny), money(a.toUsd(a.spentTodayCny))),
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = if (a.spendCapCny > 0) {
                                        stringResource(R.string.nm_cloud_spend_cap, money(a.spendCapCny), money(a.toUsd(a.spendCapCny)))
                                    } else {
                                        stringResource(R.string.nm_cloud_spend_member)
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (a.spendCapCny > 0) {
                                Spacer(Modifier.height(8.dp))
                                LinearProgressIndicator(
                                    progress = { a.spendFraction },
                                    color = MuseTones.action,
                                    trackColor = MuseTones.fill,
                                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = stringResource(R.string.nm_cloud_spent_total, money(a.spentTotalCny), money(a.toUsd(a.spentTotalCny))),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (a.spendCapCny > 0 && a.resetsAt > 0) {
                                Text(
                                    text = stringResource(R.string.nm_cloud_resets_at, resetTime(a.resetsAt)),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                text = stringResource(R.string.nm_cloud_tokens_line, numbers.format(a.used), numbers.format(a.usedToday)),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else if (a != null && a.unlimited) {
                            // No ceiling on this relay: what was used, nothing to run out of.
                            Spacer(Modifier.height(16.dp))
                            Row(Modifier.fillMaxWidth()) {
                                Text(
                                    text = stringResource(R.string.nm_cloud_unlimited),
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = stringResource(R.string.nm_cloud_used_total, numbers.format(a.used)),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = stringResource(R.string.nm_cloud_used_today_open, numbers.format(a.usedToday)),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        } else if (a != null) {
                            Spacer(Modifier.height(16.dp))
                            Row(Modifier.fillMaxWidth()) {
                                Text(
                                    text = stringResource(R.string.nm_cloud_remaining, numbers.format(a.remaining)),
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = stringResource(R.string.nm_cloud_of_granted, numbers.format(a.granted)),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            LinearProgressIndicator(
                                progress = { a.fraction },
                                color = MuseTones.action,
                                trackColor = MuseTones.fill,
                                modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                text = if (a.dailyCap > 0) {
                                    stringResource(R.string.nm_cloud_used_today, numbers.format(a.usedToday), numbers.format(a.dailyCap))
                                } else {
                                    stringResource(R.string.nm_cloud_used_today_open, numbers.format(a.usedToday))
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        error?.let {
                            Spacer(Modifier.height(8.dp))
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                    MuseRowDivider(inset = 16.dp)
                    MuseRow(
                        title = if (refreshing) stringResource(R.string.nm_cloud_refreshing) else stringResource(R.string.nm_cloud_refresh),
                        icon = Icons.Outlined.Refresh,
                        chevron = false,
                        onClick = { refresh() },
                    )
                }
                MuseGap()
                CommunityNoticeCard()
                MuseGap()
                MuseCard {
                    Text(
                        text = stringResource(R.string.nm_cloud_how_it_works),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(16.dp),
                    )
                    MuseRowDivider(inset = 16.dp)
                    MuseRow(
                        title = stringResource(R.string.nm_cloud_open_provider),
                        icon = Icons.Outlined.Tune,
                        onClick = { NanoMuseCloud.instance(context)?.let { onOpenProvider(it.id) } },
                    )
                    MuseRowDivider()
                    MuseRow(title = stringResource(R.string.settings_model_groups), onClick = onOpenModelGroups)
                }
                MuseGap()
                DevicesSection()
                MuseGap()
                MuseCard {
                    MuseRow(
                        title = stringResource(R.string.nm_cloud_sign_out),
                        icon = Icons.Outlined.Logout,
                        chevron = false,
                        titleColor = MaterialTheme.colorScheme.error,
                        onClick = { confirmSignOut = true },
                    )
                }
                Text(
                    text = stringResource(R.string.nm_cloud_sign_out_sub),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 32.dp, vertical = 8.dp),
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text(stringResource(R.string.nm_cloud_sign_out)) },
            text = { Text(stringResource(R.string.nm_cloud_sign_out_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmSignOut = false
                    scope.launch {
                        NanoMuseCloud.signOut(context)
                        account = null
                        signedIn = false
                    }
                }) { Text(stringResource(R.string.nm_cloud_sign_out), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) { Text(stringResource(R.string.cancel)) }
            },
        )
    }
}

/** ¥ / $ amounts: whole numbers above a hundred, cents otherwise, fen-fractions for the tiny ones. */
internal fun money(v: Double): String = when {
    v >= 100 -> String.format(java.util.Locale.US, "%.0f", v)
    v >= 1 -> String.format(java.util.Locale.US, "%.2f", v)
    v > 0 && v < 0.01 -> String.format(java.util.Locale.US, "%.4f", v)
    else -> String.format(java.util.Locale.US, "%.2f", v)
}

/** "00:00" or "tomorrow 00:00" in the phone's own zone, for the daily reset. */
private fun resetTime(epochSeconds: Long): String {
    val fmt = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault())
    return fmt.format(java.util.Date(epochSeconds * 1000))
}

/**
 * The community notice: nanoMuse is free, open source and non-profit; this version is open for
 * the community to try; who pays; what the relay keeps. Shown on the account page and, in short,
 * on the sign-in and first-run screens.
 */
@Composable
fun CommunityNoticeCard() {
    MuseCard {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.nm_cloud_notice_title), style = MaterialTheme.typography.titleSmall)
            Text(
                stringResource(R.string.nm_cloud_notice),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}
