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

## Prerequisites

- [Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap) **1.25+ as a global install**. Do **not** add `@bubblewrap/cli` to the app `package.json` — it fails `npm audit` and blocks feature→dev.
- From the repo root, `npm run twa:ensure` installs `@bubblewrap/cli@1.25.0` globally if `bubblewrap` is missing and puts `%AppData%\npm` on the Windows user PATH.
- JDK 17+ (Android Studio JBR is fine) and Android SDK
- Config: `%USERPROFILE%\.bubblewrap\config.json` with `jdkPath` and `androidSdkPath`

If `bubblewrap --version` prompts to install a JDK, write that config file (UTF-8, no BOM).

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

Regenerate the Bubblewrap tree after PWA icon/manifest changes:

```powershell
bubblewrap update --skipVersionUpgrade
```

Then re-apply widget Java/XML under `app/src/main/` (update overwrites generated files).
Keep `webManifestUrl` on production `https://polycal-ebon.vercel.app/manifest.webmanifest`
(that path is public; do not point it at a login-gated URL).

## Sideload

1. Enable Install unknown apps for the installer.
2. `adb install -r app/build/outputs/apk/debug/app-debug.apk`
3. Long-press home screen → Widgets → **PolyCal: Natural language**
4. Sign in inside the TWA (or Chrome on the same device) if prompted.
5. Type a description, send; complete the NLP card; existing toast + close.

## Out of scope this epic

- Play Console listing, IARC 17+, Play App Signing enrollment
- Capacitor / WebView
- iOS widgets
- Instant-create from the bar (no composer)
