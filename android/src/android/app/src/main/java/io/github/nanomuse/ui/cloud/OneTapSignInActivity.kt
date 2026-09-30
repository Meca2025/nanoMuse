package io.github.nanomuse.ui.cloud

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

/**
 * Sign in with the phone's own number: the relay's page (`/app/onetap.html`, see
 * `cloud/nanomuse_cloud/onetap.py`) in a WebView. The page loads the carrier SDK at runtime,
 * the carrier's dialog confirms the number, and the page tells us how it ended by navigating to
 * `nanomuse://onetap/done` or `nanomuse://onetap/cancel`; the caller then claims the key with
 * the verifier it kept ([io.github.nanomuse.cloud.NanoMuseCloud.oneTapClaim]). The page itself
 * never holds the key, and nothing of the SDK is in this APK.
 *
 * Navigation is confined to the relay's own origin; anything else the page or the SDK wants to
 * open (the carriers' terms) goes to the system browser.
 */
class OneTapSignInActivity : ComponentActivity() {
    private var web: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val url = intent.getStringExtra(EXTRA_URL) ?: run { finishWith(Activity.RESULT_CANCELED); return }
        val own = Uri.parse(url).host.orEmpty()
        val view = WebView(this)
        web = view
        view.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportMultipleWindows(false)
            allowFileAccess = false
            allowContentAccess = false
        }
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                when {
                    target.scheme == "nanomuse" && target.host == "onetap" -> {
                        finishWith(if (target.path == "/done") Activity.RESULT_OK else Activity.RESULT_CANCELED)
                        return true
                    }
                    target.host.equals(own, ignoreCase = true) && target.scheme in setOf("https", "http") -> return false
                    target.scheme in setOf("https", "http") -> {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, target)) }
                        return true
                    }
                    else -> return true
                }
            }

            override fun onPageStarted(v: WebView, u: String?, favicon: Bitmap?) {
                // some WebViews report the custom scheme here rather than through the override
                val t = u?.let(Uri::parse) ?: return
                if (t.scheme == "nanomuse" && t.host == "onetap") {
                    v.stopLoading()
                    finishWith(if (t.path == "/done") Activity.RESULT_OK else Activity.RESULT_CANCELED)
                }
            }
        }
        setContentView(view)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val w = web
                if (w != null && w.canGoBack()) w.goBack() else finishWith(Activity.RESULT_CANCELED)
            }
        })
        view.loadUrl(url)
    }

    private fun finishWith(result: Int) {
        if (isFinishing) return
        setResult(result)
        finish()
    }

    override fun onDestroy() {
        web?.apply {
            stopLoading()
            loadUrl("about:blank")
            clearHistory()
            destroy()
        }
        web = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "io.github.nanomuse.onetap.URL"

        fun intent(activity: android.content.Context, url: String): Intent =
            Intent(activity, OneTapSignInActivity::class.java).putExtra(EXTRA_URL, url)
    }
}
