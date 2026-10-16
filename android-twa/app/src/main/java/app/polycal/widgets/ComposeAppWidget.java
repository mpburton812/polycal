package app.polycal.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * Shared binder: header opens the TWA composer empty; field/send open the IME sheet
 * (PC-479). Layouts use TextView + shape ImageView so AppWidgetHost can inflate
 * (vectors/EditText in RemoteViews cause "Can't load widget" on many launchers).
 */
public abstract class ComposeAppWidget extends AppWidgetProvider {
    abstract String mode();
    abstract int layoutRes();
    abstract int headerId();
    abstract int inputId();
    abstract int sendId();
    abstract int rootId();
    /** Header label and field hint so one layout can serve both widgets (PC-541). */
    abstract int headerLabelRes();
    abstract int hintRes();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), layoutRes());
            views.setTextViewText(headerId(), context.getString(headerLabelRes()));
            views.setTextViewText(inputId(), context.getString(hintRes()));
            // RemoteViews.setContentDescription exists only on API 31+. Calling it
            // earlier throws and kills the process when the launcher refreshes widgets.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                views.setContentDescription(headerId(), context.getString(headerLabelRes()));
                views.setContentDescription(inputId(), context.getString(hintRes()));
            }
            views.setOnClickPendingIntent(headerId(), launchIntent(context, appWidgetId, true, 1));
            views.setOnClickPendingIntent(rootId(), launchIntent(context, appWidgetId, true, 2));
            views.setOnClickPendingIntent(inputId(), launchIntent(context, appWidgetId, false, 3));
            views.setOnClickPendingIntent(sendId(), launchIntent(context, appWidgetId, false, 4));
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    private PendingIntent launchIntent(Context context, int appWidgetId, boolean skipInput, int requestSalt) {
        Intent intent = new Intent(context, QuickComposeActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra(QuickComposeActivity.EXTRA_MODE, mode());
        intent.putExtra(QuickComposeActivity.EXTRA_SKIP_INPUT, skipInput);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        int requestCode = appWidgetId * 10 + requestSalt + (WidgetUrls.MODE_NLP.equals(mode()) ? 5000 : 0);
        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
