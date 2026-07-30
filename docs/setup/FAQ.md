# MRP FAQ

## Why can’t I find SMS or Phone permission?

Android and many OEMs hide them behind the **⋮** (three-dot) menu on the app Permissions screen.

**Path:** Settings → Apps → MRP → Permissions → ⋮ → All permissions / Allow all → enable SMS and Phone.

In MRP, Security → Permissions → **Grant Access (App Permissions)** opens the app’s settings page directly.

## Does MRP read my SMS inbox?

No. MRP only **sends** outbound SIM-change recovery messages to contacts you configure.

## Why is there no selfie for Screen Lock / Unlock?

By design. Lock and unlock events are logged without a camera capture to avoid noise and privacy churn on every lock cycle.

## Why did a Wi‑Fi / mobile data event have no selfie?

Check: monitoring on, camera + overlay granted, capture toggles for that event enabled in Monitoring settings, and that the device wasn’t mid-debounce from another capture. Rapid back-to-back events of the *same* type are debounced a few seconds to avoid duplicates; different event types can still capture with a short global camera gap.

## App Misuse doesn’t show which app?

Grant **Usage access**. New events store `app_name`, `package_name`, `foreground_status`, and time in metadata (timeline, SQLite, Drive export). Older events logged before the fix may lack those fields.

## Selfies look cropped in Timeline

Open the event → Surveillance Selfie Evidence uses **contain** framing, +/− zoom, and **Full screen / swipe** for nearby captures. Thumbnails may letterbox; the detail viewer shows the full frame.

## Selfies look too tight / zoomed in

Capture now prefers a wider ~1080p / 16:9 JPEG when the sensor supports it. New captures use the wider framing; older files are unchanged.

## Monitoring dies overnight (Xiaomi / Samsung / Oppo)

Set battery to **Unrestricted**, enable autostart / never sleeping apps, and lock MRP in Recents. See [Permissions](PERMISSIONS_AND_TRUST.md) OEM notes.

## Does Drive sync replace local data?

No. SQLite on device is primary. Drive vault mirrors timeline (and eligible selfies) when signed in and online.

## Is Device Admin used to wipe the phone?

No. MRP Device Admin is for **wrong lock-screen PIN detection** (`watch-login`) only — not wipe or force-lock.
