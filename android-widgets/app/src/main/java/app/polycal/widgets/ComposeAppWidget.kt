package app.polycal.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * Shared binder for the two compose widgets. Header/chrome opens the web composer
 * immediately (empty is fine). The field and send open a one-line activity because
 * OEM IMEs on homescreen EditTexts often drop the typed text.
 */
abstract class ComposeAppWidget : AppWidgetProvider() {
    abstract val mode: String
    abstract val layoutRes: Int
    abstract val headerId: Int
    abstract val inputId: Int
    abstract val sendId: Int
    abstract val rootId: Int

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, layoutRes)
            views.setOnClickPendingIntent(
                headerId,
                launchIntent(context, appWidgetId, skipInput = true, requestSalt = 1),
            )
            views.setOnClickPendingIntent(
                rootId,
                launchIntent(context, appWidgetId, skipInput = true, requestSalt = 2),
            )
            views.setOnClickPendingIntent(
                inputId,
                launchIntent(context, appWidgetId, skipInput = false, requestSalt = 3),
            )
            views.setOnClickPendingIntent(
                sendId,
                launchIntent(context, appWidgetId, skipInput = false, requestSalt = 4),
            )
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    private fun launchIntent(
        context: Context,
        appWidgetId: Int,
        skipInput: Boolean,
        requestSalt: Int,
    ): PendingIntent {
        val intent = Intent(context, QuickComposeActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(QuickComposeActivity.EXTRA_MODE, mode)
            putExtra(QuickComposeActivity.EXTRA_SKIP_INPUT, skipInput)
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        }
        val requestCode = appWidgetId * 10 + requestSalt + if (mode == WidgetUrls.MODE_NLP) 5_000 else 0
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
