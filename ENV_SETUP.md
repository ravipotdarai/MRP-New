# MRP Environment Setup

Copy each block into the corresponding file when implementing. **Never commit real `.env` files.**

See also [PROJECT_IMPLEMENTATION_PLAN.md](../PROJECT_IMPLEMENTATION_PLAN.md) §6.

---

## `MRP/.env` (react-native-config)

```bash
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:android:abcdef
MRP_API_BASE_URL=http://192.168.1.10:3000
MRP_WEB_BASE_URL=http://localhost:3001
```

Also place `google-services.json` in `MRP/android/app/` (gitignored).

---

## `api/.env`

```bash
NODE_ENV=development
PORT=3000
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nREPLACE\n-----END PRIVATE KEY-----\n"
GOOGLE_PLAY_PACKAGE_NAME=com.mrp
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH=./secrets/play-service-account.json
WEB_ORIGIN=http://localhost:3001
MOBILE_DEEP_LINK=mrp://
ADMIN_BOOTSTRAP_EMAIL=admin@yourcompany.com
```

---

## `web/.env.local`

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_MAP_STYLE_URL=https://demotiles.maplibre.org/style.json
```

---

## `.gitignore` additions (recommended)

```
.env
.env.local
.env.*.local
**/google-services.json
api/secrets/
```
