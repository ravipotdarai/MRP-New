# MRP Web (P6)

Independent Next.js app for **user monitoring** and **admin** — sibling of the mobile app (`../MRP`).

## Privacy

| Store | Content |
|---|---|
| Firebase Auth | Login identity |
| RTDB `device_config/{uid}` | Sync **policy** only |
| RTDB `admin_audit` | Admin action notes (no vault) |
| User Google Drive `appData` | Encrypted vault (timeline, live location, Premium+ selfies) |

Never: broad Drive listing, vault bytes in Firebase, admin selfie download APIs.

## Setup

```bash
cd "MRP Web"
cp .env.example .env.local
# fill Firebase web + Google OAuth web client (same project as mobile)
npm run dev
```

Opens [http://localhost:3001](http://localhost:3001). Nest API (optional): `../api` on `:3000/v1`.

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server :3001 |
| `npm run build` | Production static export → `out/` |
| `npm start` | Serve build :3001 (local only; hosting uses `out/`) |

## Deploy (Firebase Hosting)

Project: `mobileresilienceplatform` · Web app: `MRPWeb` (`1:966919333335:web:ef58b26505b7029ef09792`)

```bash
cd "MRP Web"
# ensure .env.production has Firebase + NEXT_PUBLIC_ADMIN_EMAILS
npm run build
npx firebase-tools deploy --only hosting --project mobileresilienceplatform
```

Live: https://mobileresilienceplatform.web.app  

RTDB rules (`device_config` + `admin_audit` for `ravipotdarai@gmail.com`):

```bash
cd ../api
npx firebase-tools deploy --only database --project mobileresilienceplatform
```

### OAuth checklist (P6-12)

In Google Cloud Console → Credentials → Web OAuth client, add **Authorized JavaScript origins**:

- `https://mobileresilienceplatform.web.app`
- `https://mobileresilienceplatform.firebaseapp.com`
- `http://localhost:3001` (local)

Drive scope (web + mobile): **`https://www.googleapis.com/auth/drive.appdata` only** (P5-10 / P6-12).

## P6 features on this site

| Area | Behavior |
|---|---|
| Monitoring / Reports | Decrypt own Drive vault in browser |
| Settings | Write own `device_config` (+ `accountEmail` hint) |
| Devices | Own policy; admin lists all configs (metadata) |
| Admin | Search uid/email hint, edit any policy, audit log; no vault access |

Nest (`../api`) is optional — CORS includes Hosting origins; Admin SDK writes when credentials are set.
