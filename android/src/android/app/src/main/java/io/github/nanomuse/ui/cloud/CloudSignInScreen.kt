package io.github.nanomuse.ui.cloud

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openminis.app.R
import io.github.nanomuse.cloud.NanoMuseCloud
import io.github.nanomuse.ui.home.MuseTones
import io.github.nanomuse.ui.muse.MuseTopAppBar
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

const val ROUTE_CLOUD_SIGN_IN = "nanomuse/cloud/sign-in"
const val ROUTE_CLOUD_ACCOUNT = "nanomuse/cloud/account"

private const val CLOUD_DOC_URL = "https://github.com/nano-muse/nanoMuse/blob/main/docs/cloud.md"

/**
 * Sign in to nanoMuse Cloud: a phone number or an e-mail address, then the code it receives.
 * On success the relay is a provider with a default model, and the caller decides where to
 * go (the first run continues to "Meet nanoMuse"; from Settings it returns to the account page).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CloudSignInScreen(
    onBack: () -> Unit,
    onSignedIn: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var identifier by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var verifying by remember { mutableStateOf(false) }
    var countdown by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    var baseOverride by remember { mutableStateOf(if (NanoMuseCloud.canOverrideBase()) NanoMuseCloud.baseUrl(context) else "") }
    val onSurface = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant

    LaunchedEffect(countdown) {
        if (countdown > 0) {
            delay(1000)
            countdown -= 1
        }
    }

    fun sendCode() {
        if (sending || identifier.isBlank()) return
        error = null
        sending = true
        scope.launch {
            try {
                if (NanoMuseCloud.canOverrideBase()) NanoMuseCloud.setBaseUrl(context, baseOverride)
                NanoMuseCloud.requestCode(context, identifier)
                codeSent = true
                countdown = 60
            } catch (e: Exception) {
                error = NanoMuseCloud.describe(context, e)
            }
            sending = false
        }
    }

    fun verify() {
        if (verifying || code.length < 4) return
        error = null
        verifying = true
        scope.launch {
            try {
                NanoMuseCloud.verify(context, identifier, code)
                onSignedIn()
            } catch (e: Exception) {
                error = NanoMuseCloud.describe(context, e)
                verifying = false
            }
        }
    }

    Scaffold(
        containerColor = MuseTones.surface,
        topBar = {
            MuseTopAppBar(
                title = {},
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(12.dp))
            Icon(
                painter = painterResource(R.drawable.ic_stat_nanomuse),
                contentDescription = null,
                tint = MuseTones.action,
                modifier = Modifier.size(44.dp),
            )
            Spacer(Modifier.height(18.dp))
            Text(
                text = stringResource(R.string.nm_cloud_signin_title),
                fontSize = 22.sp,
                lineHeight = 28.sp,
                fontWeight = FontWeight.SemiBold,
                color = onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.nm_cloud_signin_subtitle),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                color = muted,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(28.dp))

            OutlinedTextField(
                value = identifier,
                onValueChange = { identifier = it; if (codeSent) { codeSent = false; code = "" } },
                label = { Text(stringResource(R.string.nm_cloud_identifier)) },
                placeholder = { Text(stringResource(R.string.nm_cloud_identifier_hint)) },
                singleLine = true,
                enabled = !verifying,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { sendCode() }),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MuseTones.action,
                    cursorColor = MuseTones.action,
                    focusedLabelColor = MuseTones.action,
                ),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { v -> code = v.filter { it.isDigit() }.take(6) },
                    label = { Text(stringResource(R.string.nm_cloud_code)) },
                    singleLine = true,
                    enabled = codeSent && !verifying,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { verify() }),
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MuseTones.action,
                        cursorColor = MuseTones.action,
                        focusedLabelColor = MuseTones.action,
                    ),
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.padding(horizontal = 6.dp))
                TextButton(
                    onClick = { sendCode() },
                    enabled = identifier.isNotBlank() && countdown == 0 && !sending && !verifying,
                ) {
                    if (sending) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MuseTones.action)
                    } else {
                        Text(
                            text = when {
                                countdown > 0 -> stringResource(R.string.nm_cloud_resend_in, countdown)
                                codeSent -> stringResource(R.string.nm_cloud_resend)
                                else -> stringResource(R.string.nm_cloud_send_code)
                            },
                            color = if (identifier.isNotBlank() && countdown == 0) MuseTones.action else muted,
                            fontSize = 14.sp,
                        )
                    }
                }
            }

            if (NanoMuseCloud.canOverrideBase()) {
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = baseOverride,
                    onValueChange = { baseOverride = it },
                    label = { Text(stringResource(R.string.nm_cloud_debug_base)) },
                    singleLine = true,
                    enabled = !verifying,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { if (codeSent) verify() else sendCode() },
                enabled = if (codeSent) code.length >= 4 && !verifying else identifier.isNotBlank() && !sending,
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(containerColor = MuseTones.action, contentColor = Color.White),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) {
                if (verifying) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Text(
                        text = if (codeSent) stringResource(R.string.nm_cloud_verify) else stringResource(R.string.nm_cloud_send_code),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.nm_cloud_fine_print),
                fontSize = 12.sp,
                lineHeight = 16.sp,
                color = muted,
                textAlign = TextAlign.Center,
            )
            TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(CLOUD_DOC_URL))) }) {
                Text(stringResource(R.string.nm_setup_learn_more), color = MuseTones.action, fontSize = 12.sp)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
