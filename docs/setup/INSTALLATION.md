# MRP Installation Guide

## Requirements

- Android 10+ recommended (API 29+); Android 12–14 fully supported for Nearby devices / Notifications.
- Enough storage for selfies and timeline SQLite (~50+ MB free recommended).
- Optional: Google account for Drive vault sync (appDataFolder).

## Sideload (release or debug APK)

1. Copy `app-release.apk` (or debug APK) to the phone.
2. Settings → Security → allow install from that source (Files / Chrome / etc.).
3. Optionally pause Play Protect for the install, then re-enable.
4. Open the APK → Install → Open **MRP**.
5. Set your MRP PIN, then complete **Grant All Access**.

Debug install from a PC (USB debugging):

```bash
cd MRP/android
./gradlew app:installDebug
# Windows
gradlew.bat app:installDebug
```

## After install checklist

1. Grant core permissions (camera, location, notifications, overlay, device admin).
2. Set battery to **Unrestricted** (and OEM autostart where shown).
3. Turn **Monitoring** on from Security / home.
4. Optional: SIM Change Recovery → add contacts → allow SMS + Phone (see [Permissions](PERMISSIONS_AND_TRUST.md) if SMS is hidden under ⋮).
5. Optional: connect Google Drive vault for offline queue upload.

## Build from source

```bash
cd MRP
npm install
npm start
# other terminal
npm run android
```

Release APK path after `assembleRelease`:

`MRP/android/app/build/outputs/apk/release/app-release.apk`

## Next

- [Onboarding](ONBOARDING.md)
- [Permissions & Trust](PERMISSIONS_AND_TRUST.md)
- [Troubleshooting](TROUBLESHOOTING.md)
