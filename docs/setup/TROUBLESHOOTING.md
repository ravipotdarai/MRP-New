# MRP Troubleshooting Guide

## Selfie not captured for a security event

1. Confirm event is **not** Screen Lock / Unlock (no selfie by design).
2. Monitoring enabled; relevant **capture toggle** on (Monitoring settings).
3. Camera + Display over other apps granted.
4. Wait a few seconds — duplicate same-event captures are debounced; a short global camera gap applies between any two captures.
5. Check Photos / Timeline for a file named with that event prefix.
6. Overlay / battery restrictions: set Unrestricted and retry a Test Capture.

## Timeline selfie looks cropped

Use the detail card: resize mode is **contain**; tap **Full screen / swipe**. If an old build used `cover`, update the app.

## SMS / Phone permission “missing”

1. MRP → Permissions → Grant Access (App Permissions).
2. Permissions → **⋮** → All permissions.
3. Enable SMS and Phone.
4. Return to MRP — status should show Granted (no repeated prompt).

## Wrong unlock not logging

Enable **Device Admin**. For fingerprint/face failures, also enable **Accessibility**.

## Geofence false Outside Home

Poor Wi‑Fi/cell accuracy can place Magarpatta-style centroids outside a tight fence. Prefer GPS when accuracy is poor; see `docs/battery/GEOFENCE_GPS_STRATEGIES.md`. Soft-inside and lock/unlock GPS throttling are intentional.

## App Misuse never fires

1. Usage access granted.
2. Misuse rules enabled; `captureOnAppMisuse` on.
3. Trigger condition met (e.g. night social ≥ 60s).
4. Check timeline for `APP_MISUSE` with app/package metadata.

## Drive vault not uploading

Sign in; network available; offline queue drains when online. Confirm Drive connected in vault status. Timeline JSON includes event metadata (including App Misuse fields).

## Service not running after reboot

Battery unrestricted + OEM autostart. Re-open MRP once after reboot if the OEM killed the process.

## Build / install

```bash
cd MRP/android
gradlew.bat app:installDebug
adb logcat -s MrpMonitor SelfieCapture NetworkChange MisuseRule
```

## Related

- [FAQ](FAQ.md)
- [Permissions](PERMISSIONS_AND_TRUST.md)
- [Onboarding](ONBOARDING.md)
