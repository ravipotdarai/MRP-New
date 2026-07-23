# Play Billing — incomplete step (P3)

> **Status: INCOMPLETE — deferred**  
> Do **not** mark P3 complete until this is finished.  
> Temporary workaround: hardcoded catalog in the app (see below).

---

## Temporary workaround (active now)

| Item | Location |
|---|---|
| Catalog file | `MRP/src/features/subscription/Subscriptions.json` |
| Mode | `"mode": "hardcoded"` |
| Product IDs | `mrp_premium`, `mrp_premium_family`, `mrp_enterprise` (+ `free`) |
| Behavior | User picks a plan in Hub → Subscriptions; app calls native `activateCatalogProduct` and FeatureGate unlocks the same as a real purchase |

**This is for testing only.** No money is charged. Prices in JSON are placeholders.

When Play Console is ready:

1. Create a **Play Developer account** ($25 one-time) if not done.
2. Create subscriptions in **Play Console** (not Cloud Pub/Sub):
   - `mrp_premium` → base plans `monthly`, `yearly`
   - `mrp_premium_family` → `monthly`, `yearly`
   - `mrp_enterprise` → `monthly`, `yearly`
3. Add license testers; upload build to Internal testing.
4. Set `"mode": "play"` in `Subscriptions.json`.
5. Verify Hub → Subscriptions loads Play offers and real purchase/restore work.
6. Optionally remove or gate `activateCatalogProduct` for release builds.

---

## Why this was deferred

- Play Developer registration fee / account setup not finished at time of P3 device work.
- Real IAP requires Play Console products + testing track install.

---

## Related code

- `BillingModule.activateCatalogProduct` — writes entitlement cache with `source=hardcoded`
- `FeatureGate` / `EntitlementProvider` — unchanged gates; work with hardcoded or Play
- `SubscriptionScreen` — renders catalog; uses hardcoded activate when `mode=hardcoded`

---

## Checklist (later)

- [ ] Play Developer account paid and verified  
- [ ] Three subscription products + base plans activated in Play Console  
- [ ] License tester account on device  
- [ ] Internal testing AAB installed from Play  
- [ ] `Subscriptions.json` → `"mode": "play"`  
- [ ] Purchase / restore / cancel / grace tested on device  
- [ ] Remove or disable hardcoded activate path for production  
