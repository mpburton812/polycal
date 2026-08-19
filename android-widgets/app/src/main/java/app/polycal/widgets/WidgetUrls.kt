package app.polycal.widgets

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

/**
 * Builds same-origin compose deep-links the PWA already understands.
 * Widgets never submit events themselves — they only launch the web composer.
 */
object WidgetUrls {
    const val MODE_EVENT = "event"
    const val MODE_NLP = "nlp"

    private const val TITLE_MAX = 256
    private const val NLP_MAX = 1024

    /**
     * Normalizes a host URL to http(s) origin only so a bad gradle property
     * cannot launch javascript: or file: URIs.
     */
    fun sanitizeBaseUrl(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        val uri = Uri.parse(trimmed)
        val scheme = uri.scheme?.lowercase()
        if (scheme != "https" && scheme != "http") {
            return BuildConfig.POLYCAL_BASE_URL.trim().trimEnd('/')
        }
        if (uri.host.isNullOrBlank()) {
            return BuildConfig.POLYCAL_BASE_URL.trim().trimEnd('/')
        }
        return trimmed
    }

    fun composeUri(baseUrl: String, mode: String, prefill: String): Uri {
        val builder = Uri.parse("${sanitizeBaseUrl(baseUrl)}/feed").buildUpon()
            .appendQueryParameter("compose", mode)
        val text = prefill.trim()
        if (text.isNotEmpty()) {
            if (mode == MODE_NLP) {
                builder.appendQueryParameter("q", text.take(NLP_MAX))
            } else {
                builder.appendQueryParameter("title", text.take(TITLE_MAX))
            }
        }
        return builder.build()
    }

    fun launchComposer(activity: android.app.Activity, mode: String, prefill: String) {
        val uri = composeUri(BuildConfig.POLYCAL_BASE_URL, mode, prefill)
        val customTabs = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
            .build()
        try {
            customTabs.launchUrl(activity, uri)
        } catch (_: Exception) {
            // Fallback when Chrome Custom Tabs is unavailable (rare OEM / no browser).
            activity.startActivity(
                android.content.Intent(android.content.Intent.ACTION_VIEW, uri),
            )
        }
    }
}
