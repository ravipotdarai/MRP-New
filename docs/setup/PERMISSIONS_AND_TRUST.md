# MRP Permissions & Trust Guide

**Audience:** End users and implementers  
**Principle:** Protection first — grant core access once via guided flow; sensitive permissions only when needed.

---

## Install (sideload APK)

1. **Pause Play Protect** briefly (Install unknown app → allow your file manager/browser).
2. Install the MRP APK.
3. Open MRP → set PIN → tap **Grant All Access** and follow each step (~2 minutes).
4. Re-enable Play Protect if you paused it.

MRP does **not** read your SMS inbox. SMS is used **only** to send SIM-change recovery alerts to contacts **you** add.

---

## Why each permission is required

| Permission | Why MRP needs it | What happens if denied |
|---|---|---|
| **Camera** | Surveillance selfies on security events (wrong unlock, network changes, USB, etc.) | No selfie evidence |
| **Location (while using)** | Attach GPS / address to events and geofence checks | Events without accurate place |
| **Background location (“Allow all the time”)** | Geofence enter/exit and SIM recovery when MRP is not on screen | Missed geofence / recovery location |
| **Notifications (Android 13+)** | Keep the monitoring foreground service alive; show alerts | Service may be killed; no banners |
| **Nearby devices / Bluetooth (Android 12+)** | Log Bluetooth connect/disconnect timeline events | No BT timeline events |
| **Display over other apps** | Silent camera overlay for locked-screen / background capture | Selfies fail while locked |
| **Device Admin (`watch-login` only)** | Detect wrong PIN/password unlock attempts | No wrong-unlock capture |
| **Battery unrestricted** | Survive OEM kill of background work | Monitoring stops after idle |
| **Usage access** | App misuse rules (which app triggered misuse) | No APP_MISUSE detection |
| **Accessibility (optional)** | Instant Lock + biometric wrong-unlock detection | Instant Lock / biometric fail events unavailable |
| **SMS (SEND_SMS)** | Outbound SIM-change recovery SMS to *your* contacts | No recovery SMS |
| **Phone / Phone numbers** | Read SIM number for “New Number” in recovery SMS | SMS may omit new number |

---

## Permission tiers

| Tier | Permissions | When | Required for monitoring? |
|------|-------------|------|--------------------------|
| **1 — Core** | Camera, Location, Notifications, Display over other apps, Device Admin (`watch-login` only) | Grant All Access wizard | **Yes** |
| **2 — Survival** | Battery unrestricted, OEM autostart (Xiaomi/Samsung/etc.) | End of wizard | Recommended |
| **3 — SIM Recovery** | SEND_SMS, Phone (optional) | When you enable SIM Change Recovery + consent | SMS only |
| **4 — Optional** | Accessibility (Instant Lock + biometrics), Usage Stats | Separate cards | No |

---

## How to grant permissions (standard path)

```
Settings
  ↓
Apps
  ↓
MRP
  ↓
Permissions
  ↓
⋮ three-dot menu (if SMS / Phone / other items are missing)
  ↓
All permissions  /  Allow all permissions
  ↓
Enable the missing permission
```

**Grant Access** in MRP opens Android’s **app details / permission page** for MRP (`ACTION_APPLICATION_DETAILS_SETTINGS`). From there open **Permissions**, then use the **⋮** menu if a permission is not listed.

MRP does **not** re-prompt for a permission once it is already granted.

---

## Finding SMS and Phone (common issue)

On many devices, **SMS** and **Phone** are not shown on the main Permissions list until you open the overflow menu:

1. Settings → Apps → MRP → **Permissions**
2. Tap **⋮** (top-right)
3. Choose **All permissions**, **Allow all**, or **Additional permissions** (wording varies)
4. Enable **SMS / Messages** and **Phone / Phone numbers**

If the system dialog was denied permanently (“Don’t ask again”), use **Grant Access** in MRP → Permissions → SMS / Phone cards.

---

## Android version differences

| Android | Notes |
|---|---|
| **10–11** | Background location is a separate step after “while using”. Overlay under Special access. |
| **12 (API 31+)** | **Nearby devices** required for Bluetooth connect/disconnect logging. |
| **13 (API 33+)** | **Notifications** runtime permission required for the foreground service. **READ_PHONE_NUMBERS** for SIM number. |
| **14+** | Stricter background activity starts; MRP uses approved PendingIntent modes for selfie capture. Battery / autostart OEM screens still matter most. |

---

## OEM-specific notes

| OEM | Tips |
|---|---|
| **Samsung** | Permissions → ⋮ → All permissions for SMS/Phone. Also: Battery → Unrestricted; Auto run / Never sleeping apps. |
| **Xiaomi / Redmi / POCO (MIUI / HyperOS)** | Autostart + Battery saver → No restrictions. Permissions → Other permissions / All permissions for SMS. Lock MRP in Recents. |
| **OnePlus (OxygenOS / ColorOS)** | App battery → Unrestricted; Auto-launch. SMS may sit under All permissions. |
| **Vivo (Funtouch / OriginOS)** | High background power consumption / Autostart. Permission manager → All. |
| **Oppo / Realme (ColorOS)** | Startup manager + Allow background activity. Use ⋮ → All permissions for SMS/Phone. |
| **Google Pixel** | Closest to stock AOSP; SMS/Phone usually listed; still check ⋮ if missing after deny. |
| **Motorola** | Battery optimization → Don’t optimize. Permissions list is usually stock-like. |

Exact labels change by OS version; if a toggle is missing, always try the **⋮** menu on the app Permissions screen first.

---

## SMS — emergency recovery only

- **Sends:** One alert per SIM change to **your recovery contacts**.
- **Does not:** Read SMS, receive SMS, marketing, or contact anyone except your saved numbers.
- **Consent:** Sample message shown before SMS permission is requested.

---

## Accessibility — Instant Lock + optional biometrics

- **Instant Lock:** With MRP Accessibility enabled, Security → **Lock screen now** (and Panic) can lock the device via Android’s accessibility lock action — **not** Device Admin `force-lock`.
- **Also adds:** Detection of failed fingerprint/face unlock (no public API otherwise).
- **Not required** for basic monitoring or wrong PIN capture (Device Admin `watch-login`).
- **Does not** read other apps’ screen content (narrow event types only).

Enable from Security → Permissions → Accessibility when you want Instant Lock or biometric wrong-unlock capture.

---

## Device Care (owner phone) — no wipe/reset Device Admin

MRP does **not** declare Device Admin `wipe-data`, `reset-password`, or `force-lock` (those are **phone** lock-screen APIs that trigger bank/AV “risky app” alerts — not the MRP app PIN).

| Goal | How MRP does it |
|------|-----------------|
| **MRP app PIN reset** | Lock screen → **Forgot PIN** → recovery code or Google (unchanged; soft wipe does not clear it) |
| Instant lock | Accessibility → Lock screen now / Panic |
| Erase MRP data | Soft wipe (type **WIPE**) — timeline, selfies, SIM recovery, local circles; stops monitoring |
| Factory reset | Opens **Find My Device** (Google) |
| Phone lock-screen PIN | Out of scope — change in Android Settings → Security if needed |

---

## Grant All Access flow

One button chains: runtime dialogs → overlay → device admin → battery/OEM settings. Return to MRP after each step; the app advances automatically.

If a step was skipped, **Finish setup** shows only what's missing.

Once a permission shows **Granted**, MRP will not keep asking for it.

---

## Cellular-primary location

Most users are on mobile data. MRP resolves location on cellular normally; GPS is used only as a last resort for security events.

---

## Related guides

- [Installation](INSTALLATION.md)
- [Onboarding](ONBOARDING.md)
- [FAQ](FAQ.md)
- [Troubleshooting](TROUBLESHOOTING.md)
