# MRP (Mobile Resilience Platform)

Android security companion: timeline events, surveillance selfies, geofence, SIM recovery SMS, and optional Google Drive vault sync.

Built with **React Native** + native **Kotlin** (Clean Architecture / vertical slices).

## Docs (start here)

| Guide | Path |
|---|---|
| Installation | [`../docs/setup/INSTALLATION.md`](../docs/setup/INSTALLATION.md) |
| Onboarding | [`../docs/setup/ONBOARDING.md`](../docs/setup/ONBOARDING.md) |
| Permissions & Trust | [`../docs/setup/PERMISSIONS_AND_TRUST.md`](../docs/setup/PERMISSIONS_AND_TRUST.md) |
| FAQ | [`../docs/setup/FAQ.md`](../docs/setup/FAQ.md) |
| Troubleshooting | [`../docs/setup/TROUBLESHOOTING.md`](../docs/setup/TROUBLESHOOTING.md) |
| All docs index | [`../docs/README.md`](../docs/README.md) |

## Quick start (dev)

```bash
# from MRP/
npm install
npm start
# other terminal
npm run android
# or
cd android && gradlew.bat app:installDebug
```

## Product notes

- **Selfies:** Most configured security events capture via `MrpMonitorService.requestPhoto`. **Screen lock/unlock do not.**
- **App Misuse:** Requires Usage Access; events store app name, package, foreground status, and time.
- **SMS/Phone:** Often under Permissions → **⋮** → All permissions on OEM skins — see Permissions guide.

## RN environment

Complete the [React Native Environment Setup](https://reactnative.dev/docs/environment-setup) before first build.
