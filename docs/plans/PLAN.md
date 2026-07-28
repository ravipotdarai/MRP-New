# MRP - Mobile Relocation Provider Implementation Plan

## Overview

Building a React Native (CLI) Android app called **MRP** (Mobile Relocation Provider) with the following core features:
- Accessibility Service + Foreground Service for lock/unlock detection
- Front camera capture on device unlock
- PIN lock to protect the app itself
- Photo gallery with delete functionality

**Tech Stack:** React Native 0.76.x (CLI, no Expo) + Kotlin native modules

---

## Phase 1: Project Scaffolding

### 1.1 Initialize React Native Project
- Run `npx react-native@0.76.9 init MRP --version 0.76.9`
- Project location: `d:\Projects\MRP New\MRP`

### 1.2 Expected Structure
```
MRP/
├── android/app/src/main/java/com/mrp/
│   ├── MainActivity.kt
│   ├── MainApplication.kt
│   ├── WtmpNativeModule.kt
│   ├── PinLockModule.kt
│   ├── SettingsActivity.kt
│   └── service/
│       ├── WtmpMonitorService.kt      # Foreground service + CameraX
│       └── WtmpAccessibilityService.kt
├── android/app/src/main/res/
│   ├── xml/wtmp_accessibility_config.xml
│   ├── layout/settings_activity.xml
│   └── values/strings.xml
└── src/
    ├── native/WtmpNative.types.ts
    ├── native/PinLock.types.ts
    ├── hooks/useWtmpMonitoring.ts
    ├── hooks/usePinLock.ts
    ├── screens/
    │   ├── PinLockScreen.tsx
    │   └── MonitoringScreen.tsx
    ├── components/PhotoGallery.tsx
    └── utils/settings.ts
```

---

## Phase 2: Native Android Components

### 2.1 WtmpMonitorService.kt
- **Type:** Foreground Service (foregroundServiceType="camera")
- **Camera:** CameraX with front camera
- **Trigger:** Receives `ACTION_REQUEST_PHOTO` broadcast
- **Saves:** Photos to `getExternalFilesDir("photos")` with timestamp naming

### 2.2 WtmpAccessibilityService.kt
- **Event Types:** `TYPE_WINDOW_STATE_CHANGED`
- **Detection Logic:**
  - Track locked state via known lock screen packages
  - When locked→unlocked transition detected, broadcast `ACTION_REQUEST_PHOTO`
- **Lock Screen Packages:** com.android.systemui, com.android.keyguard, com.google.android.keyguard, com.samsung.android.keyguard, miui.lockscreen, etc.

### 2.3 WtmpNativeModule.kt
Exposes to JS:
- `startMonitoring()` → starts WtmpMonitorService
- `stopMonitoring()` → stops WtmpMonitorService
- `requestAccessibilityEnable()` → opens accessibility settings
- `getPhotos(callback)` → returns array of photo paths
- `deletePhoto(path)` → deletes a photo file
- `takePhoto()` → forces immediate photo capture

### 2.4 PinLockModule.kt
- Stores PIN using `SharedPreferences` (encrypted with Android Keystore)
- `setPin(pin)` / `verifyPin(pin)` / `isPinSet()` / `clearPin()`

### 2.5 AndroidManifest.xml
Required permissions:
- `CAMERA`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_CAMERA`
- `POST_NOTIFICATIONS`
- `RECEIVE_BOOT_COMPLETED`

Service declarations:
- WtmpMonitorService (foregroundServiceType="camera")
- WtmpAccessibilityService

---

## Phase 3: React Native Frontend

### 3.1 App Entry Flow
1. **App.tsx** checks `isPinSet()`
   - If PIN not set → show `PinLockScreen` (setup mode)
   - If PIN set → show `PinLockScreen` (verify mode)
   - After successful verification → show `MonitoringScreen`

### 3.2 PinLockScreen.tsx
- **Setup Mode:** Enter PIN twice to confirm, save via `PinLockModule.setPin()`
- **Verify Mode:** 4-6 digit PIN entry, verify via `PinLockModule.verifyPin()`

### 3.3 MonitoringScreen.tsx
- **Header:** "MRP - Mobile Relocation Provider"
- **Start/Stop Monitoring** button (calls native `startMonitoring`/`stopMonitoring`)
- **Enable Accessibility Service** button
- **Status indicator** (monitoring active/inactive)
- **Photo Gallery:** Grid of captured photos with timestamps, delete button

### 3.4 PhotoGallery.tsx
- Fetch photos via `WtmpNative.getPhotos()`
- Display as grid with `Image` component
- Show delete button per photo
- Pull-to-refresh

---

## Phase 4: Implementation Steps

### Step 1: Initialize RN project
```bash
cd "d:\Projects\MRP New"
npx react-native@0.76.9 init MRP --version 0.76.9
```

### Step 2: Add dependencies
```bash
cd MRP
npm install @react-native-async-storage/async-storage
npm install @react-native-camera-roll/camera-roll (for gallery if needed)
```

### Step 3: Create native modules
- Create `WtmpNativeModule.kt` with all native method implementations
- Create `PinLockModule.kt` for PIN management
- Create `WtmpMonitorService.kt` with CameraX foreground service
- Create `WtmpAccessibilityService.kt` with lock detection
- Create `SettingsActivity.kt` + layout

### Step 4: Register modules in MainApplication.kt
- Add `WtmpAppPackage` to React Native's package list

### Step 5: Update AndroidManifest.xml
- Add all permissions
- Declare services

### Step 6: Create React Native TypeScript files
- `src/native/WtmpNative.types.ts`
- `src/native/PinLock.types.ts`
- `src/hooks/useWtmpMonitoring.ts`
- `src/hooks/usePinLock.ts`

### Step 7: Create React Native UI
- `src/screens/PinLockScreen.tsx`
- `src/screens/MonitoringScreen.tsx`
- `src/components/PhotoGallery.tsx`
- Update `App.tsx`

### Step 8: Build and test
- Debug build: `./gradlew assembleDebug`
- Release build with signing config

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| RN Version | 0.76.9 | Stable with New Architecture support |
| Camera | CameraX | Modern API, lifecycle-aware |
| Background detection | AccessibilityService | Most reliable across OEMs |
| PIN storage | EncryptedSharedPreferences | Secure, no external library needed |
| Photo storage | getExternalFilesDir | No runtime storage permission needed |
| Service restart | RECEIVE_BOOT_COMPLETED | Auto-start after reboot |

---

## Verification Checklist

- [ ] PIN setup works
- [ ] PIN verification works
- [ ] Accessibility service can be enabled from app
- [ ] Monitoring starts/stops correctly
- [ ] Foreground notification appears when monitoring
- [ ] Photo captured on lock→unlock transition
- [ ] Photos display in gallery
- [ ] Photos can be deleted
- [ ] App survives lock screen and resumes correctly
- [ ] Release APK builds successfully

---

## Estimated Effort

| Phase | Files | Complexity |
|-------|-------|------------|
| Native Android (services, modules) | ~8 | High |
| RN Types & Hooks | ~5 | Medium |
| RN UI Screens | ~4 | Medium |
| Configuration & Manifest | ~3 | Low |
| Build & Test | - | Medium |

**Total:** ~20 files to create/modify