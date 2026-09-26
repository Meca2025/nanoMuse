package io.github.nanomuse.ui.cloud

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Language
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.openminis.app.R
import io.github.nanomuse.hub.Hub
import io.github.nanomuse.ui.home.MuseTones
import io.github.nanomuse.ui.muse.MuseCaption
import io.github.nanomuse.ui.muse.MuseCard
import io.github.nanomuse.ui.muse.MuseGap
import io.github.nanomuse.ui.muse.MuseRow
import io.github.nanomuse.ui.muse.MuseRowDivider
import io.github.nanomuse.ui.muse.MuseSectionLabel

/**
 * The account's devices on the hub, under the nanoMuse Cloud account: this phone's two
 * switches (be reachable; be operable), its name, the other devices with an online dot, and
 * the web console's address. Shown only while signed in.
 */
@Composable
fun DevicesSection() {
    val context = LocalContext.current
    val connected by Hub.connected.collectAsState()
    val devices by Hub.devices.collectAsState()
    var enabled by remember { mutableStateOf(Hub.enabled(context)) }
    var remote by remember { mutableStateOf(Hub.remoteControl(context)) }
    var name by remember { mutableStateOf(Hub.name(context)) }
    var editName by remember { mutableStateOf(false) }
    val me = remember { Hub.deviceId(context) }
    val others = devices.filter { it.id != me && it.kind != "web" }
    val consoleUrl = remember { Hub.webConsoleUrl(context) }
    var forget by remember { mutableStateOf<io.github.nanomuse.hub.Device?>(null) }

    MuseSectionLabel(stringResource(R.string.nm_devices_title))
    MuseCard {
        Text(
            text = stringResource(R.string.nm_devices_intro),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(16.dp),
        )
        MuseRowDivider(inset = 16.dp)
        MuseRow(
            title = stringResource(R.string.nm_devices_join),
            value = when {
                !enabled -> stringResource(R.string.nm_devices_off)
                connected -> stringResource(R.string.nm_devices_connected)
                else -> stringResource(R.string.nm_devices_connecting)
            },
            chevron = false,
            onClick = { enabled = !enabled; Hub.setEnabled(context, enabled) },
            trailing = { Switch(checked = enabled, onCheckedChange = { enabled = it; Hub.setEnabled(context, it) }) },
        )
        MuseCaption(stringResource(R.string.nm_devices_join_sub), modifier = Modifier.padding(bottom = 4.dp))
        MuseRowDivider(inset = 16.dp)
        MuseRow(
            title = stringResource(R.string.nm_devices_remote_control),
            chevron = false,
            onClick = { remote = !remote; Hub.setRemoteControl(context, remote) },
            trailing = { Switch(checked = remote, onCheckedChange = { remote = it; Hub.setRemoteControl(context, it) }) },
        )
        MuseCaption(stringResource(R.string.nm_devices_remote_control_sub), modifier = Modifier.padding(bottom = 4.dp))
        MuseRowDivider(inset = 16.dp)
        NameRow(label = stringResource(R.string.nm_devices_name), name = name, onClick = { editName = true })
    }
    MuseGap()
    MuseCard {
        if (others.isEmpty()) {
            Text(
                text = stringResource(R.string.nm_devices_none),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(16.dp),
            )
        } else {
            others.forEachIndexed { i, d ->
                if (i > 0) MuseRowDivider()
                MuseRow(
                    title = d.name,
                    icon = if (d.isPhone) Icons.Outlined.PhoneAndroid else Icons.Outlined.Computer,
                    value = listOf(d.os, if (d.online) stringResource(R.string.nm_devices_online) else stringResource(R.string.nm_devices_offline)).filter { it.isNotBlank() }.joinToString(" · "),
                    chevron = false,
                    onClick = { if (!d.online) forget = d },
                    trailing = { OnlineDot(d.online) },
                )
            }
        }
    }
    MuseCaption(stringResource(R.string.nm_devices_how))
    MuseGap()
    MuseCard {
        MuseRow(
            title = stringResource(R.string.nm_devices_web),
            icon = Icons.Outlined.Language,
            value = consoleUrl.removePrefix("https://").removePrefix("http://"),
            chevron = false,
            onClick = { copy(context, consoleUrl) },
            trailing = { TextButton(onClick = { copy(context, consoleUrl) }) { Text(stringResource(R.string.nm_devices_web_copy), color = MuseTones.action) } },
        )
    }
    MuseCaption(stringResource(R.string.nm_devices_web_sub, consoleUrl))

    forget?.let { d ->
        AlertDialog(
            onDismissRequest = { forget = null },
            title = { Text(d.name) },
            text = { Text(stringResource(R.string.nm_devices_forget_sub)) },
            confirmButton = {
                TextButton(onClick = { Hub.forget(d.id); forget = null }) { Text(stringResource(R.string.nm_devices_forget), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { forget = null }) { Text(stringResource(android.R.string.cancel)) } },
        )
    }

    if (editName) {
        var draft by remember { mutableStateOf(name) }
        AlertDialog(
            onDismissRequest = { editName = false },
            title = { Text(stringResource(R.string.nm_devices_name)) },
            text = { OutlinedTextField(value = draft, onValueChange = { draft = it.take(60) }, singleLine = true, modifier = Modifier.fillMaxWidth()) },
            confirmButton = {
                TextButton(onClick = {
                    Hub.setName(context, draft)
                    name = Hub.name(context)
                    editName = false
                }) { Text(stringResource(android.R.string.ok)) }
            },
            dismissButton = { TextButton(onClick = { editName = false }) { Text(stringResource(android.R.string.cancel)) } },
        )
    }
}

/** A label over the name, so a long name has the whole width. */
@Composable
private fun NameRow(label: String, name: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.PhoneAndroid, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f), modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun OnlineDot(online: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .size(10.dp)
                .background(if (online) Color(0xFF2FB344) else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f), CircleShape),
        )
    }
}

private fun copy(context: Context, text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("nanoMuse", text))
    Toast.makeText(context, R.string.nm_devices_web_copied, Toast.LENGTH_SHORT).show()
}
