package app.polycal.widgets;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

/**
 * Builds same-origin compose deep-links. Widgets never submit events — they open
 * the TWA LauncherActivity so Chrome reuses the Auth.js session (PC-479).
 */
public final class WidgetUrls {
    public static final String MODE_EVENT = "event";
    public static final String MODE_NLP = "nlp";
    public static final String HOST_ORIGIN = "https://polycal.net";

    private static final int TITLE_MAX = 256;
    private static final int NLP_MAX = 1024;

    private WidgetUrls() {}

    /**
     * Builds /feed?compose= with optional title or q, capped so the query cannot bloat.
     */
    public static Uri composeUri(String mode, String prefill) {
        Uri.Builder builder = Uri.parse(HOST_ORIGIN + "/feed").buildUpon()
                .appendQueryParameter("compose", mode);
        String text = prefill == null ? "" : prefill.trim();
        if (!text.isEmpty()) {
            if (MODE_NLP.equals(mode)) {
                builder.appendQueryParameter("q", text.length() > NLP_MAX ? text.substring(0, NLP_MAX) : text);
            } else {
                builder.appendQueryParameter("title", text.length() > TITLE_MAX ? text.substring(0, TITLE_MAX) : text);
            }
        }
        return builder.build();
    }

    /**
     * Opens the compose URL inside this TWA package (not a Chrome Custom Tab).
     */
    public static void launchComposer(Activity activity, String mode, String prefill) {
        Uri uri = composeUri(mode, prefill);
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage(activity.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            activity.startActivity(intent);
        } catch (Exception ignored) {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, uri));
        }
    }
}
