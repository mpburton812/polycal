/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package app.polycal;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    

    

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A translucent activity that calls setRequestedOrientation crashes immediately
        // on Android 8.0 (API 26), including SCREEN_ORIENTATION_UNSPECIFIED.
        // Skip the call entirely there. Chrome still applies the manifest orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496.
        if (Build.VERSION.SDK_INT != Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }
        // Sideload APK update prompt (GitHub Releases) — fail-soft if offline (PC-483).
        UpdateChecker.checkAsync(this);
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri intentUri = getIntent() != null ? getIntent().getData() : null;
        if (intentUri != null
                && "https".equals(intentUri.getScheme())
                && "polycal.net".equals(intentUri.getHost())) {
            return intentUri;
        }
        return super.getLaunchingUrl();
    }
}
