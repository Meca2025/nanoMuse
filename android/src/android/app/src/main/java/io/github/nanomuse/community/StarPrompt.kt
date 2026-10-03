package io.github.nanomuse.community

import android.content.Context
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
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openminis.app.R
import com.openminis.app.ui.components.openExternalUrl
import io.github.nanomuse.ui.home.MuseTones

/**
 * The ask for a star, at the moments it is fair to make it: when the free allowance was just
 * claimed (the first sign-in), after the first task the agent finished, and when the
 * allowance is used up (a row among the ways on). Each moment is asked once on a phone;
 * tapping through to GitHub ends them all. Never a dialog — a card where the moment is.
 */
object StarPrompt {
    /** The repository the star goes to. */
    const val REPO_URL = "https://github.com/nano-muse/nanoMuse"

    private const val PREFS = "nm.star"
    private const val KEY_STARRED = "starred"

    enum class Moment(internal val key: String) {
        /** The account page the first time it is seen signed in: the allowance was just claimed. */
        SIGNED_IN("signed_in"),
        /** The first turn that ended with a reply, on this phone. */
        FIRST_TASK("first_task"),
    }

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Still worth asking at this moment: not asked before, and the person has not gone to star it yet. */
    fun due(context: Context, moment: Moment): Boolean {
        val p = prefs(context)
        return !p.getBoolean(KEY_STARRED, false) && !p.getBoolean(moment.key, false)
    }

    /** The person has been to GitHub from one of the asks. */
    fun starred(context: Context): Boolean = prefs(context).getBoolean(KEY_STARRED, false)

    /** The card was shown (or waved away): this moment is spent. */
    fun markShown(context: Context, moment: Moment) {
        prefs(context).edit().putBoolean(moment.key, true).apply()
    }

    /** Off to GitHub, and no more asking anywhere. */
    fun open(context: Context) {
        prefs(context).edit().putBoolean(KEY_STARRED, true).apply()
        openExternalUrl(context, REPO_URL)
    }
}

/** The amber of the star, the one colour the card adds. */
private val StarAmber = Color(0xFFF5A623)

/**
 * One card: the star, a line or two saying why, "Star on GitHub" and "Not now". [text] is the
 * line for the moment; [onDone] runs after either button so the caller can drop the card.
 */
@Composable
fun StarNudgeCard(
    text: String,
    modifier: Modifier = Modifier,
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MuseTones.surface,
        border = BorderStroke(1.dp, MuseTones.hairline),
        modifier = modifier.fillMaxWidth().widthIn(max = 400.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.StarOutline, contentDescription = null, tint = StarAmber, modifier = Modifier.padding(top = 1.dp).size(20.dp))
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.nm_star_title),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = text,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.width(30.dp))
                Button(
                    onClick = { StarPrompt.open(context); onDone() },
                    shape = CircleShape,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MuseTones.action, contentColor = Color.White),
                ) { Text(stringResource(R.string.nm_star_action), fontSize = 13.sp, fontWeight = FontWeight.Medium) }
                Spacer(Modifier.width(6.dp))
                TextButton(onClick = onDone) {
                    Text(stringResource(R.string.nm_star_later), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
