# P8-4 — Circle FCM + deep links

## What shipped

| Layer | Piece |
|---|---|
| Android | `firebase-messaging`, `MrpFcmModule`, `MrpFirebaseMessagingService` |
| RTDB | `devices/{uid}/{deviceId}` `{ fcmToken, updatedAtMs, platform }` + rules |
| Nest | `AdminPushPort` + `POST /v1/circles/:id/invite/push` + `PUT /v1/devices/:uid/fcm` |
| App | Deep links `mrp://circle/join?code=` + https App Link; Share includes links |
| Web | `/circle/join?code=` handoff page |

## Device flow

1. Sign in (Firebase Auth) → after PIN unlock app calls `registerForCircleInvites`.
2. Token written to RTDB `devices/{uid}/mrp_{androidId}`.
3. Owner shares invite (system Share with https + `mrp://` links) **or** Nest push with `targetUid`.
4. Invitee taps notification / link → join screen prefilled with code.

## Nest push (optional, when API + Admin SDK up)

```http
POST /v1/circles/{circleId}/invite/push
Authorization: Bearer <Firebase ID token>
Content-Type: application/json

{ "targetUid": "<invitee Firebase UID>" }
```

Looks up FCM tokens under `devices/{targetUid}` and sends notification + data payload.

## Deploy rules

From `api/`:

```bash
firebase deploy --only database --project mobileresilienceplatform
```

## App Links (P8-4)

Debug `assetlinks.json` lives at `MRP Web/public/.well-known/assetlinks.json` (package `com.mrp`, debug keystore SHA-256).

After Next export + Hosting deploy it is served at:  
`https://mobileresilienceplatform.web.app/.well-known/assetlinks.json`

Add the **Play App Signing** SHA-256 before store release (replace or append fingerprint).

## Manual 2-device check

- [ ] Both devices Google Sign-In + Enterprise
- [ ] Device B: Hub → Circle opens after unlock (token registered)
- [ ] Device A: Share invite → open link on B → code prefilled → Join
- [ ] Optional: Nest push with B’s Firebase UID → notification on B

## Notes

- Verified App Links need `assetlinks.json` on the hosting domain (optional polish).
- Formal E2E matrix remains **P8-7**.
