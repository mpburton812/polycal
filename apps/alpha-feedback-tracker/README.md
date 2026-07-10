# PolyCal Alpha Feedback Tracker

Windows desktop triage app for alpha tester feedback (PC-122). Talks to PolyCal’s admin API — never connects to Turso directly.

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) + MSVC build tools (Windows)
- Node 20+
- WebView2 (usually preinstalled on Windows 10/11)

## Setup

```bash
cd apps/alpha-feedback-tracker
npm install
```

## Develop (UI only)

Runs the Vite UI in a browser against a PolyCal base URL (local/dev/test/prod):

```bash
npm run dev
```

Open http://localhost:1420, enter the PolyCal base URL and an admin username/password.

## Develop (Tauri window)

```bash
npm run tauri:dev
```

## Build Windows installer

```bash
npm run tauri:build
```

Artifacts land under `src-tauri/target/release/bundle/` (`.msi` / `.exe` depending on targets).

## API used

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/alpha-feedback/login` | Admin bearer token |
| GET | `/api/admin/alpha-feedback` | List submissions |
| GET | `/api/admin/alpha-feedback/:id` | Detail + screenshot |
| PATCH | `/api/admin/alpha-feedback/:id` | Status / comments |
| POST | `/api/admin/alpha-feedback/:id/notify` | In-app notify submitter |
