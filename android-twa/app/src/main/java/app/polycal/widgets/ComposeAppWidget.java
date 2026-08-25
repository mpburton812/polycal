package app.polycal.widgets;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
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

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), layoutRes());
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
