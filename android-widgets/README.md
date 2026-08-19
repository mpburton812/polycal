# PolyCal Android compose widgets

Thin native shell with two home-screen widgets. It does **not** wrap PolyCal in a WebView.
Taps open the hosted PWA in **Chrome Custom Tabs** (fallback: `ACTION_VIEW`) so the existing
Auth.js session in Chrome is reused.

| Widget | Label | Opens |
|--------|--------|--------|
| Standard add | PolyCal: New Event | `/feed?compose=event&title=` |
| Natural language | PolyCal: Natural language | `/feed?compose=nlp&q=` |

Empty send still opens the matching empty composer. Prefill text is passed as query params;
the web app opens `ProposalDraftDialog` and submits through the existing server actions.

Launcher IME on widget `EditText` is unreliable, so the field/send control opens a one-line
native sheet, then Custom Tabs. Tapping the widget title/chrome skips the sheet and opens
the web composer immediately (empty is fine).

This is **not** Play Store / TWA / Capacitor distribution. Sideload the debug APK.

## Prerequisites

- Android Studio (Ladybug or newer) or JDK 17 + Android SDK 35
- A hosted PolyCal origin the device can reach (dev/test/production Vercel, or your LAN IP)

## Host URL

Default (production): `https://polycal-ebon.vercel.app`

Override at assemble time:

```bash
./gradlew :app:assembleDebug -PpolycalBaseUrl=https://polycal-git-dev-michael-burton-s-projects.vercel.app
```

On Windows PowerShell:

```powershell
.\gradlew.bat :app:assembleDebug "-PpolycalBaseUrl=https://polycal-git-dev-michael-burton-s-projects.vercel.app"
```

Local Next (`npm run dev`) from a device: use your machine's LAN IP, not `localhost`
(`http://192.168.x.x:3000`). HTTP is allowed for alpha; javascript/file URLs are rejected.

The built URL is shown on the **PolyCal Widgets** info screen after install.

## Assemble a debug APK

From this folder, in Android Studio: **Open** → `android-widgets` → **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

Or CLI once a Gradle wrapper exists (Android Studio generates `gradlew` on first sync):

```bash
./gradlew :app:assembleDebug
```

APK path: `app/build/outputs/apk/debug/app-debug.apk`

## Sideload and add widgets

1. Enable **Install unknown apps** for the installer (Files / ADB).
2. `adb install -r app/build/outputs/apk/debug/app-debug.apk` (or open the APK on the phone).
3. Long-press the home screen → **Widgets** → **PolyCal: New Event** and **PolyCal: Natural language**.
4. Sign in to PolyCal in Chrome (or the installed PWA) on the same device if prompted.
5. Type a title/description, send; complete the event card; toast + close is the existing web flow.

Unauthenticated: Chrome opens login, then resumes the compose URL (query string included).

## Out of scope this phase

- Play App Signing, Bubblewrap, Digital Asset Links, store listing
- Capacitor / full TWA shell (separate cookie jar — do not use for widgets)
- iOS home-screen widgets
