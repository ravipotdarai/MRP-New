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

### Google Sign-In (Android) — fix error 10 / DEVELOPER_ERROR

Error **10** means Firebase/Google Cloud does not recognize this app’s signing certificate.

1. In [Firebase Console](https://console.firebase.google.com) → Project settings → Your apps → **Android** app (`com.mrp`):
   - Add **SHA-1** (debug keystore used by MRP):

     ```
     5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
     ```

     (From `MRP/android/app/debug.keystore` — also shown under Hub → Account.)
   - Optionally add SHA-256:

     ```
     FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
     ```

2. Download updated `google-services.json` → `MRP/android/app/google-services.json`.
3. In `MRP/android/app/src/main/res/values/strings.xml`, set `google_web_client_id` to the **Web** OAuth client ID (ends with `.apps.googleusercontent.com`). Do **not** use the Android client ID.
4. Rebuild/reinstall the app. Wait a few minutes after adding SHA-1 if Google Console still returns error 10.

```bash
# Recompute SHA-1 from the app debug keystore:
keytool -list -v -keystore MRP/android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

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
