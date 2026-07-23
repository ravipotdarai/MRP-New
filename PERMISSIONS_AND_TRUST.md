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

## Permission tiers

| Tier | Permissions | When | Required for monitoring? |
|------|-------------|------|--------------------------|
| **1 — Core** | Camera, Location, Notifications, Display over other apps, Device Admin (`watch-login` only) | Grant All Access wizard | **Yes** |
| **2 — Survival** | Battery unrestricted, OEM autostart (Xiaomi/Samsung/etc.) | End of wizard | Recommended |
| **3 — SIM Recovery** | SEND_SMS, Phone (optional) | When you enable SIM Change Recovery + consent | SMS only |
| **4 — Optional** | Accessibility (Instant Lock + biometrics), Usage Stats | Separate cards | No |

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

---

## Cellular-primary location

Most users are on mobile data. MRP resolves location on cellular normally; GPS is used only as a last resort for security events.

---

## Future: web tracking

Location history is stored locally in `geo_snapshots` for future sync to a web recovery map (planned). Timeline and Gallery behavior unchanged today.
