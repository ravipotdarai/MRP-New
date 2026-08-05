# Skipped / removed features

## USB Restriction (Hub · Premium+)

**Status:** Removed from product (2026-08-05)

**Why:** Android only allows real USB charge-only enforcement via **Device Owner** (`setUsbDataSignalingEnabled`, API 31+). Consumer installs cannot get Device Owner without factory reset / OEM provisioning. Detect-only “restriction” UI over-promised and was not worth shipping.

**Kept:** Basic USB **monitoring** — `captureOnUsb`, `USB_CONNECTED` / `USB_DISCONNECTED` timeline events, optional selfie on USB attach (Monitoring settings).

**Not kept:** Hub section, feature gate `usb.restriction`, prefs (`usbRestrictionEnabled`, PIN/network gates, unlock TTL), `UsbRestrictionPolicy`, native unlock/status APIs, `USB_POLICY_BLOCKED` events.

**Restore:** Recover from git history if enterprise Device Owner builds are pursued later.
