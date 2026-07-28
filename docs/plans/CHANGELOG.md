# Changelog

## 2026-07-18

### Fixed
- Home Current Location now fetches live GPS and reverse-geocoded address
- Event selfie matching no longer attaches lock/unlock photos to wrong events
- App Usage Dashboard / Timeline / Reports use on-demand UsageStats (ACTIVITY_* + MOVE_TO_*) with correct aggregations
- Security header cleanup (removed redundant Timeline title; tab realignment)

### Added
- **SIM Change Recovery Alert**: encrypted recovery contacts (max 3), SIM identity baseline, offline GNSS capture with FixStatus, automatic SMS on SIM change, pending sync queue, Monitoring settings panel, notifications
- Unit tests for selfie matching and SIM recovery logic

### Deferred
- Google Drive sync of SIM change evidence (queue only)
