package io.github.nanomuse.ui.cloud

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openminis.app.R
import io.github.nanomuse.cloud.AllowanceSignal
import io.github.nanomuse.cloud.NanoMuseCloud
import io.github.nanomuse.ui.home.MuseTones

/** The public guide for bringing one's own key, when the relay did not name one. */
const val OWN_KEY_DOCS = "https://nanomuse.cn/own-key"

/** The in-app link that opens "add a provider" pre-filled for Alibaba Cloud Bailian. */
const val OWN_KEY_DEEP_LINK = "minis://settings/providers/add?preset=bailian"

/**
 * The two ways on when the free allowance is spent (or nearly): one's own key — Alibaba
 * Cloud Bailian first, one tap to the pre-filled provider form and a link to the guide —
 * and an invitation (+¥5 for each side, share or copy the link). Shown on the account page
 * whenever the pool is spent or past 80 %, and in the chat when a turn was refused for it.
 * [exhausted] false = the heads-up wording.
 */
@Composable
fun AllowanceWaysCard(
    info: AllowanceSignal.Exhausted,
    exhausted: Boolean,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val account = remember { NanoMuseCloud.account(context) }
    val inviteBonus = info.inviteBonusCny.takeIf { it > 0 } ?: account?.inviteBonusCny?.takeIf { it > 0 } ?: 5.0
    val inviteeBonus = info.inviteeBonusCny.takeIf { it > 0 } ?: account?.inviteeBonusCny?.takeIf { it > 0 } ?: inviteBonus
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { kotlinx.coroutines.delay(1500); copied = false } }
    val link = info.inviteUrl.ifBlank { account?.inviteUrl.orEmpty() }.ifBlank {
        "https://nanomuse.cn/web/?invite=" + account?.inviteCode.orEmpty()
    }

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MuseTones.surface,
        border = BorderStroke(1.dp, MuseTones.hairline),
        modifier = modifier.fillMaxWidth().widthIn(max = 400.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(
                text = if (exhausted) stringResource(R.string.nm_ways_title_out)
                else stringResource(R.string.nm_ways_title_warn, money(info.leftCny), money(info.grantCny)),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(R.string.nm_ways_sub),
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
            Spacer(Modifier.height(10.dp))

            // ① one's own key
            Way(Icons.Outlined.Key, MuseTones.action, stringResource(R.string.nm_ways_key_title), stringResource(R.string.nm_ways_key_body)) {
                Button(
                    onClick = { com.openminis.app.ui.chat.ChatLinkResolver.dispatchDeepLink(context, OWN_KEY_DEEP_LINK) },
                    shape = CircleShape,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MuseTones.action, contentColor = Color.White),
                ) { Text(stringResource(R.string.nm_ways_key_action), fontSize = 13.sp, fontWeight = FontWeight.Medium) }
                Spacer(Modifier.width(6.dp))
                TextButton(onClick = {
                    val url = info.ownKeyDocs.ifBlank { account?.ownKeyDocs.orEmpty() }.ifBlank { OWN_KEY_DOCS }
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }) { Text(stringResource(R.string.nm_ways_key_guide), fontSize = 13.sp, color = MuseTones.action) }
            }

            // ② an invitation: both sides gain
            Way(Icons.Outlined.PersonAdd, Color(0xFF7C5CFF), stringResource(R.string.nm_ways_invite_title, money(inviteBonus), money(inviteeBonus)), null) {
                TextButton(onClick = {
                    val text = context.getString(R.string.nm_cloud_invite_share_text, account?.inviteCode.orEmpty(), link)
                    val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }
                    runCatching {
                        context.startActivity(Intent.createChooser(send, context.getString(R.string.nm_cloud_invite_share)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }) {
                    Icon(Icons.Outlined.Share, contentDescription = null, modifier = Modifier.size(15.dp), tint = MuseTones.action)
                    Spacer(Modifier.width(5.dp))
                    Text(stringResource(R.string.nm_ways_invite_share), fontSize = 13.sp, color = MuseTones.action)
                }
                TextButton(onClick = { clipboard.setText(AnnotatedString(link)); copied = true }) {
                    Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(15.dp), tint = MuseTones.action)
                    Spacer(Modifier.width(5.dp))
                    Text(stringResource(if (copied) R.string.nm_cloud_invite_copied else R.string.nm_ways_invite_copy), fontSize = 13.sp, color = MuseTones.action)
                }
            }
        }
    }
}

@Composable
private fun Way(icon: ImageVector, tint: Color, title: String, body: String?, actions: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.padding(top = 2.dp).size(18.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 19.sp, color = MaterialTheme.colorScheme.onSurface)
            if (body != null) {
                Text(body, fontSize = 12.sp, lineHeight = 17.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 2.dp))
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) { actions() }
        }
    }
}
