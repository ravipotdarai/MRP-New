# MRP Onboarding Guide

## First launch (≈2 minutes)

1. **PIN** — create the MRP app PIN (not your phone lock PIN).
2. **Grant All Access** — follow the wizard: camera, location, notifications, nearby devices (Android 12+), overlay, device admin, then battery/OEM screens.
3. Return to MRP after each Android settings jump; the wizard advances when the permission is granted.
4. Tap **Finish setup** if anything was skipped — only missing items are listed.

## Enable monitoring

Turn monitoring on so the foreground service can log security events, capture selfies (when configured), and sync the offline queue when online.

## Event selfies (what to expect)

Configured security events (Wi‑Fi, mobile data, airplane mode, USB, wrong unlock, app misuse, etc.) capture a surveillance selfie when camera + overlay allow it.

**Exceptions (no selfie by design):** Screen Locked and Screen Unlocked.

## SIM Change Recovery (optional)

1. Add recovery contacts.
2. Review the sample SMS and consent.
3. Allow **SMS** and **Phone**.
4. If those toggles are missing: Settings → Apps → MRP → Permissions → **⋮** → All permissions. Use **Grant Access** in-app to open that page.

## Usage / App Misuse (optional)

Grant **Usage access** so MRP can detect misuse rules and record **application name**, **package**, time, and foreground status on the timeline, reports, and Drive export.

## Google Drive vault (optional)

Connect Drive so timeline (and eligible selfies) upload to the private appDataFolder when the network is available. Local SQLite remains the source of truth offline.

## Daily use

- **Home** — today’s timeline, location summary, quick security tiles.
- **Security → Timeline** — full events; open a row for selfie evidence (pinch / zoom / full-screen swipe).
- **Photos** — gallery of surveillance captures.
- **Permissions** — re-check anything denied; granted items are not re-prompted.

## Related

- [Installation](INSTALLATION.md)
- [Permissions & Trust](PERMISSIONS_AND_TRUST.md)
- [FAQ](FAQ.md)
