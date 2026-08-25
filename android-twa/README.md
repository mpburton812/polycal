# PolyCal Trusted Web Activity (`app.polycal`)

Play-shaped Android wrapper for the PolyCal PWA, plus home-screen compose widgets.
This is **not** Capacitor or a Chrome Custom Tabs dummy APK. The launcher is a
Bubblewrap TWA of production HTTPS; widgets open `/feed?compose=` **inside** that
TWA so Chrome reuses the Auth.js cookie session.

Apple users keep the Safari PWA. iOS has no type-in home-screen bar in this package.

| Surface | Opens |
| --- | --- |
| App icon | `https://polycal-ebon.vercel.app/` in the TWA |
| **PolyCal: Natural language** widget | `/feed?compose=nlp&q=` |
| **PolyCal: New Event** widget | `/feed?compose=event&title=` |

Empty send still opens the matching empty composer. Prefill is query-only; submit
stays `createDraftProposalAction` + `submitProposalAction`.

Launcher widget `EditText` IMEs are unreliable, so the field/send control opens a
one-line native sheet, then the TWA.

## Permanent constraints (do not reverse)

These are also agent rules in `.cursorrules` §1 and gotchas in `AGENTS.md`.

| Rule | Why |
| --- | --- |
| Keep production `/manifest.webmanifest` (and `/.well-known`) **public** | Login-gating the manifest breaks Bubblewrap `update` / JSON parse |
| Never add `@bubblewrap/cli` to the app lockfile | Pulls npm audit findings; blocks feature→dev. Use `npm run twa:ensure` |
| Write `%USERPROFILE%\.bubblewrap\config.json` (UTF-8, **no BOM**) before first CLI run | Interactive JDK prompts hang non-interactive agent shells |
| After `bubblewrap update`, re-apply widget Java/XML under `app/src/main/` | Update overwrites generated Bubblewrap sources |

## Prerequisites

- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap) **1.25+ as a global install**. Do **not** add `@bubblewrap/cli` to the app `package.json` — it fails `npm audit` and blocks feature→dev.
- From the repo root, `npm run twa:ensure` installs `@bubblewrap/cli@1.25.0` globally if `bubblewrap` is missing and puts `%AppData%\npm` on the Windows user PATH.
- JDK 17+ (Android Studio JBR is fine) and Android SDK
- Config: `%USERPROFILE%\.bubblewrap\config.json` with `jdkPath` and `androidSdkPath`

**Before the first CLI call on a machine**, write that config file (UTF-8, no BOM), for example:

```json
{
  "jdkPath": "C:\\Program Files\\Android\\Android Studio\\jbr",
  "androidSdkPath": "C:\\Users\\<you>\\AppData\\Local\\Android\\Sdk"
}
```

If `bubblewrap --version` still prompts to install a JDK, the config is missing, wrong path, or was saved with a BOM.

## GitHub Releases (production)

Every merge to `production` runs [`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml):

1. Reads the newest change-control version from `src/lib/changelog/entries.ts` (e.g. `2026.08.25b`).
2. Builds a **signed** `assembleRelease` APK with that `versionName` and the next `versionCode`.
3. Creates GitHub Release tag `android-v{version}` with assets:
   - `PolyCal-{version}.apk` — install this
   - `release-meta.json` — used by the in-app update prompt

**Download URL pattern:**  
`https://github.com/mpburton812/polycal/releases/download/android-v{version}/PolyCal-{version}.apk`  
Latest list: https://github.com/mpburton812/polycal/releases

### Required GitHub Actions secrets

| Secret | Value |
| --- | --- |
| `POLYCAL_ANDROID_KEYSTORE_BASE64` | `base64 -w0 android.keystore` (same cert as `assetlinks.json`) |
| `POLYCAL_ANDROID_STORE_PASSWORD` | Keystore password |
| `POLYCAL_ANDROID_KEY_ALIAS` | Key alias (usually `android`) |
| `POLYCAL_ANDROID_KEY_PASSWORD` | Key password |

### In-app update prompt

On launch, the TWA compares the installed `versionName`/`versionCode` to the newest `android-v*` Release’s `release-meta.json`. If newer, it shows summary + change bullets and can download/install the APK (allow **Install unknown apps** for PolyCal).

### Android system notifications (Web Push)

`enableNotifications` / `DelegationService` stays on. With production **VAPID** env vars set and push enabled in Profile, inbox events that call `sendPushToUser` appear as **Android system notifications** (shade + sound per channel). Digital Asset Links must match the signing cert.

**Smoke test:** install Release APK → sign in → Profile → Enable push → trigger a notification from another account → expect shade entry under PolyCal.

## Signing (sideload)

The Play upload key is **not** in git. Create a local keystore (gitignored):

```powershell
keytool -genkeypair -keystore android.keystore -alias android -keyalg RSA -keysize 2048 -validity 10000
```

Point `twa-manifest.json` `signingKey` at that file. Put the cert SHA-256 into
`public/.well-known/assetlinks.json` and add a second fingerprint when you enroll
Play App Signing. Without a match, Chrome shows a URL bar.

Fingerprint after you have a keystore:

```powershell
keytool -list -v -keystore android.keystore -alias android
```

## Assemble

From this folder:

```powershell
.\gradlew.bat :app:assembleDebug
```

Or `bubblewrap build --skipPwaValidation` (needs the keystore passwords).

APK: `app/build/outputs/apk/debug/app-debug.apk`  
CI release APK: `app/build/outputs/apk/release/app-release.apk` (then renamed for GitHub).

Regenerate the Bubblewrap tree after PWA icon/manifest changes:

```powershell
bubblewrap update --skipVersionUpgrade
```

Then re-apply widget Java/XML under `app/src/main/` (update overwrites generated files).
Keep `webManifestUrl` on production `https://polycal-ebon.vercel.app/manifest.webmanifest`
(that path is public; do not point it at a login-gated URL).

## Sideload

1. Enable Install unknown apps for the installer.
2. Prefer the GitHub Release APK, or `adb install -r app/build/outputs/apk/debug/app-debug.apk`
3. Long-press home screen → Widgets → **PolyCal: Natural language**
4. Sign in inside the TWA (or Chrome on the same device) if prompted.
5. Type a description, send; complete the NLP card; existing toast + close.
6. Profile → Enable push for Android system notifications.

## Out of scope this epic

- Play Console listing, IARC 17+, Play App Signing enrollment
- Capacitor / WebView / FCM
- iOS widgets
- Instant-create from the bar (no composer)
