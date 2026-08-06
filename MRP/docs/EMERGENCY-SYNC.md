# Emergency sync (Phase 1)

When **Emergency tracking** or **event sync** is enabled, MRP attempts lawful panic uploads to Drive:

| Trigger | Action |
|---------|--------|
| USB attached | Immediate panic sync (wipe-risk) |
| SIM removed | **Auto-enables emergency tracking** + immediate panic sync |
| Validated network returns | Flush outbox (emergency mode or recent panic) |
| Factory reset signal | Immediate panic sync |

Panic sync uses a **critical-first** payload (recent security events + live location, no selfies) and bypasses normal sync interval. Emergency mode allows sync on **any validated** Wi‑Fi or mobile data (not only Hub wifi-only).

Requires a prior Hub → Drive backup so auto-PIN is stored.

On SIM removal, MRP turns on emergency tracking (find-my-device profile), mirrors config to Firebase, starts emergency location/sync ticks, and panics to Drive. If the SIM was only auto-enabled, reinserting the SIM turns emergency off again.

**Not included (Phase 2+):** PC Bridge, open Wi‑Fi auto-join, password cracking.
