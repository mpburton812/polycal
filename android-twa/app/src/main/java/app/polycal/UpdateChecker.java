package app.polycal;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Checks GitHub Releases for a newer PolyCal Android APK and prompts with changelog.
 * Uses public release-meta.json from tags android-v* (PC-483).
 */
public final class UpdateChecker {
  private static final String TAG = "PolyCalUpdate";
  private static final String PREFS = "polycal_updates";
  private static final String KEY_SNOOZE_UNTIL = "snooze_until_ms";
  private static final String KEY_SNOOZE_VERSION = "snooze_version";
  private static final String REPO_RELEASES =
      "https://api.github.com/repos/mpburton812/polycal/releases?per_page=10";
  private static final String USER_AGENT = "PolyCal-Android-UpdateChecker";
  private static final long SNOOZE_MS = 24L * 60L * 60L * 1000L;

  private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

  private UpdateChecker() {}

  /**
   * Schedules a background check; shows a dialog on the activity when an update exists.
   */
  public static void checkAsync(Activity activity) {
    if (activity == null || activity.isFinishing()) return;
    EXECUTOR.execute(() -> {
      try {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
        long snoozeUntil = prefs.getLong(KEY_SNOOZE_UNTIL, 0L);
        String snoozeVersion = prefs.getString(KEY_SNOOZE_VERSION, "");
        ReleaseMeta remote = fetchLatestAndroidRelease();
        if (remote == null) return;

        PackageInfo info = activity.getPackageManager()
            .getPackageInfo(activity.getPackageName(), 0);
        String installedName = info.versionName != null ? info.versionName : "0";
        long installedCode = Build.VERSION.SDK_INT >= 28
            ? info.getLongVersionCode()
            : info.versionCode;

        boolean newerByCode = remote.versionCode > installedCode;
        boolean newerByName = !remote.versionName.equals(installedName)
            && remote.versionCode >= installedCode;
        if (!newerByCode && !newerByName) return;

        if (remote.versionName.equals(snoozeVersion) && System.currentTimeMillis() < snoozeUntil) {
          return;
        }

        activity.runOnUiThread(() -> showDialog(activity, prefs, remote, installedName));
      } catch (Exception e) {
        Log.w(TAG, "Update check failed", e);
      }
    });
  }

  private static void showDialog(
      Activity activity,
      SharedPreferences prefs,
      ReleaseMeta remote,
      String installedName
  ) {
    if (activity.isFinishing()) return;

    StringBuilder body = new StringBuilder();
    body.append(installedName).append(" → ").append(remote.versionName).append("\n\n");
    if (remote.summary != null && !remote.summary.isEmpty()) {
      body.append(remote.summary).append("\n\n");
    }
    body.append("What's new:\n");
    for (String change : remote.changeLines) {
      body.append("• ").append(change).append("\n");
    }

    TextView message = new TextView(activity);
    int pad = (int) (16 * activity.getResources().getDisplayMetrics().density);
    message.setPadding(pad, pad / 2, pad, pad / 2);
    message.setText(body.toString());
    message.setTextIsSelectable(true);
    ScrollView scroll = new ScrollView(activity);
    scroll.addView(message);

    new AlertDialog.Builder(activity)
        .setTitle("PolyCal update available")
        .setView(scroll)
        .setPositiveButton("Update", (d, which) -> EXECUTOR.execute(() ->
            downloadAndInstall(activity, remote)))
        .setNegativeButton("Later", (d, which) -> prefs.edit()
            .putLong(KEY_SNOOZE_UNTIL, System.currentTimeMillis() + SNOOZE_MS)
            .putString(KEY_SNOOZE_VERSION, remote.versionName)
            .apply())
        .setCancelable(true)
        .show();
  }

  private static void downloadAndInstall(Activity activity, ReleaseMeta remote) {
    try {
      if (remote.apkUrl == null || remote.apkUrl.isEmpty()) {
        Log.w(TAG, "No APK asset URL on release");
        return;
      }
      File dir = new File(activity.getCacheDir(), "updates");
      if (!dir.exists() && !dir.mkdirs()) {
        Log.w(TAG, "Cannot create updates cache");
        return;
      }
      File apk = new File(dir, remote.apkAssetName != null
          ? remote.apkAssetName
          : ("PolyCal-" + remote.versionName + ".apk"));
      HttpURLConnection conn = (HttpURLConnection) new URL(remote.apkUrl).openConnection();
      conn.setRequestProperty("User-Agent", USER_AGENT);
      conn.setInstanceFollowRedirects(true);
      conn.connect();
      try (InputStream in = new BufferedInputStream(conn.getInputStream());
           FileOutputStream out = new FileOutputStream(apk)) {
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) >= 0) {
          out.write(buf, 0, n);
        }
      } finally {
        conn.disconnect();
      }

      Uri uri = FileProvider.getUriForFile(
          activity,
          activity.getPackageName() + ".fileprovider",
          apk);
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(uri, "application/vnd.android.package-archive");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      activity.startActivity(intent);
    } catch (Exception e) {
      Log.w(TAG, "APK download/install failed", e);
    }
  }

  private static ReleaseMeta fetchLatestAndroidRelease() throws Exception {
    HttpURLConnection conn = (HttpURLConnection) new URL(REPO_RELEASES).openConnection();
    conn.setRequestProperty("User-Agent", USER_AGENT);
    conn.setRequestProperty("Accept", "application/vnd.github+json");
    conn.connect();
    String json = readAll(conn.getInputStream());
    conn.disconnect();

    JSONArray releases = new JSONArray(json);
    for (int i = 0; i < releases.length(); i++) {
      JSONObject release = releases.getJSONObject(i);
      String tag = release.optString("tag_name", "");
      if (!tag.startsWith("android-v")) continue;
      if (release.optBoolean("draft", false) || release.optBoolean("prerelease", false)) {
        continue;
      }
      JSONArray assets = release.optJSONArray("assets");
      if (assets == null) continue;
      String metaUrl = null;
      String apkUrl = null;
      String apkName = null;
      for (int a = 0; a < assets.length(); a++) {
        JSONObject asset = assets.getJSONObject(a);
        String name = asset.optString("name", "");
        String url = asset.optString("browser_download_url", "");
        if ("release-meta.json".equals(name)) metaUrl = url;
        if (name.endsWith(".apk")) {
          apkUrl = url;
          apkName = name;
        }
      }
      if (metaUrl == null) continue;
      ReleaseMeta meta = parseMeta(metaUrl);
      if (meta == null) continue;
      meta.apkUrl = apkUrl;
      if (apkName != null) meta.apkAssetName = apkName;
      return meta;
    }
    return null;
  }

  private static ReleaseMeta parseMeta(String metaUrl) throws Exception {
    HttpURLConnection conn = (HttpURLConnection) new URL(metaUrl).openConnection();
    conn.setRequestProperty("User-Agent", USER_AGENT);
    conn.connect();
    String json = readAll(conn.getInputStream());
    conn.disconnect();
    JSONObject obj = new JSONObject(json);
    ReleaseMeta meta = new ReleaseMeta();
    meta.versionName = obj.optString("versionName", "");
    meta.versionCode = obj.optInt("versionCode", 0);
    meta.summary = obj.optString("summary", "");
    meta.apkAssetName = obj.optString("apkAssetName", null);
    JSONArray changes = obj.optJSONArray("changes");
    if (changes != null) {
      for (int i = 0; i < changes.length(); i++) {
        JSONObject c = changes.getJSONObject(i);
        String description = c.optString("description", "");
        if (!description.isEmpty()) meta.changeLines.add(description);
      }
    }
    if (meta.versionName.isEmpty()) return null;
    return meta;
  }

  private static String readAll(InputStream in) throws Exception {
    StringBuilder sb = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(in, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        sb.append(line).append('\n');
      }
    }
    return sb.toString();
  }

  private static final class ReleaseMeta {
    String versionName;
    int versionCode;
    String summary;
    String apkUrl;
    String apkAssetName;
    final java.util.ArrayList<String> changeLines = new java.util.ArrayList<>();
  }
}
