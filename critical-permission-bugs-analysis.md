# Critical Permission Bugs Analysis - MRP App

## Issue Summary

Three critical permission issues found in **release mode**:

1. ❌ **App Usage Stats Permission** - "Permit access to app usage data" option is disabled in Settings
2. ❌ **Display Over Other Apps** - Cannot toggle ON even after navigating to Settings
3. ❌ **Camera Access** - Cannot toggle ON if it's already OFF

---

## 🔍 **ROOT CAUSE ANALYSIS**

### **1. APP USAGE STATS PERMISSION BUG**

#### Current Implementation
**File:** `AppUsageTracker.kt:136-147`
```kotlin
fun hasUsageStatsPermission(): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
    val mode = appOps.checkOpNoThrow(
        android.app.AppOpsManager.OPSTR_GET_USAGE_STATS,
        android.os.Process.myUid(),
        context.packageName
    )
    return if (mode == android.app.AppOpsManager.MODE_DEFAULT) {
        context.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED
    } else {
        mode == android.app.AppOpsManager.MODE_ALLOWED
    }
}
```

**File:** `MrpNativeModule.kt:438-456` (Permission request)
```kotlin
@ReactMethod
fun requestUsageStatsPermission(promise: Promise) {
    try {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
        promise.resolve(true)
    } catch (e: Exception) {
        promise.reject("REQUEST_PERMISSION_ERROR", "Failed to open Usage Access settings", e)
    }
}
```

#### The Problem

**Why it's disabled in release mode:**

1. **OEM-Specific Restrictions:**
   - **Xiaomi MIUI:** Disables "App usage data" toggle for all third-party apps by default
   - **Samsung:** Disables the toggle for apps not signed with Samsung's key
   - **Huawei/Honor:** Disables the toggle for non-system apps in production builds
   - **OnePlus:** Restricts usage stats access to core system apps

2. **Permission Model:**
   - `PACKAGE_USAGE_STATS` is a **special permission**, not a normal Android permission
   - It **cannot** be requested via `requestPermissions()` like normal permissions
   - User must manually grant it in Settings, but many OEMs block this

3. **AppOps Check Issue:**
   - `checkOpNoThrow()` returns `MODE_DEFAULT` (not granted) OR `MODE_DENIED` (explicitly denied)
   - If the user never saw the prompt, it returns `MODE_DEFAULT`
   - This is **misleading** - it doesn't mean the user declined, just never asked

#### Why Users Can't Grant It:

```
User Action: Navigate to Settings > Apps > MRP > App Usage Data
Result: Option "Permit access to app usage data" is DISABLED (grayed out)

Possible Causes:
1. MIUI blocks all third-party apps from this setting
2. Samsung requires app signing with Samsung Development Program
3. Production build restrictions prevent user from changing this
4. Permission revoked by Google Play Protect
```

#### Impact:
- **Complete functionality loss** - App cannot track other apps
- Users see misleading "Permission Required" messages
- App usage tracking feature is completely broken in production

---

### **2. DISPLAY OVER OTHER APPS PERMISSION BUG**

#### Current Implementation
**File:** `MrpNativeModule.kt:226-251`
```kotlin
@ReactMethod
fun checkOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        promise.resolve(Settings.canDrawOverlays(reactContext))
    } else {
        promise.resolve(true)
    }
}

@ReactMethod
fun requestOverlayPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        if (!Settings.canDrawOverlays(reactContext)) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + reactContext.packageName)
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    } else {
        promise.resolve(false)
    }
}
```

**AndroidManifest.xml:16**
```xml
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
```

#### The Problem

**Why toggle is disabled:**

1. **OEM Restrictions:**
   - **Xiaomi MIUI:** Disables overlay permission for all third-party apps in production
   - **Samsung:** Requires app to be whitelisted by Samsung (not possible for third-party apps)
   - **Huawei/Honor:** Blocks overlay for non-system apps
   - **OnePlus:** Limits overlay to system apps only

2. **Permission Architecture:**
   - `SYSTEM_ALERT_WINDOW` is **not a normal Android permission**
   - User must manually grant it, but OEMs disable the toggle
   - No programmatic way to bypass OEM restrictions

3. **Release Mode Issues:**
   - **Production signing** prevents apps from changing critical permissions
   - **Google Play Protect** may revoke this permission
   - **OEM battery optimizations** may force-disable it

#### Why Users Can't Toggle It:

```
User Action: Tap "Display over other apps" setting
Result: App appears but toggle is DISABLED (grayed out)

Possible Causes:
1. MIUI blocks all third-party apps from using overlay
2. Samsung blocks it unless app is in their whitelist
3. Production signing prevents permission changes
4. App was denied during installation
```

#### Impact:
- **Camera cannot capture photos on lock screen** (broken feature)
- Cannot show "Take Selfie" overlay during security events
- Critical monitoring functionality fails

---

### **3. CAMERA PERMISSION BUG**

#### Current Implementation

**Files:**
- `MrpNativeModule.kt` - **NO camera permission request method**
- `CameraCaptureActivity.kt:105` - Only checks permission, doesn't request
- `MrpMonitorService.kt:988,1111` - Only checks permission

**What Exists:**
```kotlin
// Only permission CHECK, no request
if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
    != PackageManager.PERMISSION_GRANTED) {
    Log.w(TAG, "Camera permission not granted, skipping photo capture")
    return
}
```

**What's Missing:**
- ❌ No `requestPermissions()` call
- ❌ No permission request method in `MrpNativeModule`
- ❌ No retry mechanism if user denies
- ❌ No guidance for first-time users

#### The Problem

**Why camera cannot be toggled ON:**

1. **Permission Not Requested:**
   - Camera permission is never explicitly requested
   - User must manually grant it in Settings > Apps > MRP > Permissions
   - If user never saw the prompt, permission remains denied

2. **No User Guidance:**
   - No in-app notification when permission is needed
   - No clear message telling user to go to Settings
   - "Permission Denied" message with no actionable guidance

3. **Denial Handling:**
   - If user denies permission once, Android doesn't ask again (unless reinstall)
   - No "Change Permission" button in app UI
   - No tutorial for new users

4. **Release Mode Issues:**
   - **Google Play Protect** may block camera access
   - **OEM restrictions** (Xiaomi/MIUI) may require special handling
   - **Permission revocation** happens automatically in production

#### Why Camera is Always OFF:

```
User Experience:
1. First launch: No permission request shown
2. Event triggers: "Permission denied" message
3. User goes to Settings > MRP > Permissions
4. Camera toggle is OFF (grayed out)
5. User toggles it ON
6. Still doesn't work because permission was never requested programmatically
```

#### Impact:
- **Cannot capture any photos** - All monitoring features that require photos fail
- Users see "Permission denied" with no way to fix it
- **No workaround available** - Manual permission granting doesn't work

---

## 📊 **OEM-Specific Issues**

### **Xiaomi MIUI (Most Restrictive)**

| Permission | Issue | Workaround |
|------------|-------|------------|
| App Usage Stats | Completely disabled for third-party apps | ❌ No workaround |
| Display Over Apps | Disabled for all non-system apps | ❌ No workaround |
| Camera | May require special handling | ❌ No reliable workaround |

### **Samsung**

| Permission | Issue | Workaround |
|------------|-------|------------|
| App Usage Stats | Disabled unless app signed with Samsung key | ❌ Requires developer program |
| Display Over Apps | Disabled unless whitelisted | ❌ Not available for third-party apps |
| Camera | Generally works but may be blocked by battery optimization | ⚠️ Sometimes works |

### **Huawei/Honor**

| Permission | Issue | Workaround |
|------------|-------|------------|
| App Usage Stats | Disabled for non-system apps | ❌ No workaround |
| Display Over Apps | Disabled for third-party apps | ❌ No workaround |
| Camera | Generally works | ✅ Usually works |

### **OnePlus**

| Permission | Issue | Workaround |
|------------|-------|------------|
| App Usage Stats | Limited access | ⚠️ Partial workaround available |
| Display Over Apps | Generally works | ✅ Usually works |
| Camera | Generally works | ✅ Usually works |

---

## ✅ **SOLUTIONS**

### **1. App Usage Stats Permission**

#### Short-term Solution (No Code Change)

**For Users:**

1. **Xiaomi:**
   - Root required to modify system settings
   - Or use MIUI's "Security Center" > "App Settings" > "App Usage"

2. **Samsung:**
   - Join Samsung Developer Program
   - Get app signed with Samsung keys
   - Contact Samsung support to whitelist app

3. **Huawei/Honor:**
   - Some users may find it in Settings > Privacy > Permission Manager
   - Contact Huawei support

4. **General Workaround:**
   - Use a secondary app to log app usage (different approach)
   - Disable battery optimization for MRP to enable more permissions

**For Developers (Requires Code Change):**

1. Add fallback: Track app usage via different method (AccessibilityService)
2. Add "Usage Tracker" feature using other techniques
3. Document which devices don't support this feature

---

### **2. Display Over Other Apps Permission**

#### Short-term Solution (No Code Change)

**For Users:**

1. **Xiaomi:**
   - Root required to modify system settings
   - Or accept that overlay won't work

2. **Samsung:**
   - Only possible if whitelisted by Samsung

3. **General Workaround:**
   - Capture photos without overlay (only works when screen is on)
   - Accept limitations in documentation

**For Developers (Requires Code Change):**

1. **Graceful Degradation:**
   - When overlay is denied, disable lock-screen capture
   - Show toast message explaining limitation
   - Allow photo capture only when screen is unlocked

2. **Alternative Approaches:**
   - Use Notification for alerts (works when overlay is denied)
   - Use AccessibilityService for lock-screen access (more complex)

3. **User Communication:**
   - Show warning message on first launch if overlay permission is denied
   - Explain why feature won't work and offer alternatives

---

### **3. Camera Permission**

#### Short-term Solution (No Code Change)

**For Users:**

1. **Manually Grant Permission:**
   ```
   Settings > Apps > MRP > Permissions
   Toggle "Camera" ON
   ```

2. **Force Permission Request:**
   ```
   1. Close MRP app completely
   2. Reopen MRP app
   3. When permission prompt appears, tap "Allow"
   ```

3. **Check Battery Optimization:**
   ```
   Settings > Battery > Battery Optimization
   Find MRP, set to "Don't optimize"
   ```

4. **Disable Google Play Protect:**
   ```
   Settings > Google > Play Protect
   Add exception for MRP
   ```

**For Developers (Requires Code Change):**

1. **Add Permission Request in Native Module:**

```kotlin
@ReactMethod
fun requestCameraPermission(promise: Promise) {
    try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (ActivityCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED) {

                val activity = currentActivity
                if (activity != null) {
                    ActivityCompat.requestPermissions(
                        activity,
                        arrayOf(Manifest.permission.CAMERA),
                        REQUEST_CAMERA_PERMISSION
                    )
                }
            }
        }
        promise.resolve(true)
    } catch (e: Exception) {
        promise.reject("CAMERA_ERROR", "Failed to request camera permission", e)
    }
}
```

2. **Handle Permission Result:**

```kotlin
override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray
) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_CAMERA_PERMISSION) {
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            // Permission granted - user can now use camera
        } else {
            // Permission denied - show user-friendly message
            Toast.makeText(this, "Camera permission required for photo capture", Toast.LENGTH_LONG).show()
        }
    }
}
```

3. **Add to AndroidManifest.xml:**

```xml
<application ...>
    <activity
        android:name=".MainActivity"
        android:configChanges="..."
        android:launchMode="singleTask"
        android:windowSoftInputMode="adjustResize"
        android:exported="true"
        android:requestLegacyExternalStorage="true">

        <!-- Add this line -->
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>
</application>
```

4. **Show Permission Request at App Launch:**

```javascript
// In your React Native component
useEffect(() => {
    NativeModules.MrpNative.requestCameraPermission()
        .then(() => {
            console.log('Camera permission requested');
        })
        .catch(error => {
            console.error('Failed to request camera permission:', error);
            Alert.alert(
                'Permission Required',
                'MRP needs camera access to capture photos during security events.\n\n' +
                'Please go to: Settings > Apps > MRP > Permissions\n' +
                'Enable Camera and try again.',
                [{ text: 'OK' }]
            );
        });
}, []);
```

5. **Add Retry Mechanism:**

```javascript
const requestCameraPermission = async () => {
    const granted = await NativeModules.MrpNative.checkCameraPermission();
    if (!granted) {
        const shouldRetry = await Alert.alert(
            'Camera Permission Denied',
            'Camera permission is required to capture photos.\n\n' +
            'Do you want to open Settings to grant permission?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => {
                    NativeModules.MrpNative.openAppSettings();
                }}
            ]
        );
        if (shouldRetry) {
            // After user returns from Settings, check permission again
            setTimeout(() => {
                requestCameraPermission();
            }, 1000);
        }
    }
};
```

---

## 🎯 **PRIORITY ACTIONS**

### **Critical (Fix Immediately)**

1. ✅ **Add Camera Permission Request** - Makes camera work for most users
2. ✅ **Add Camera Permission Check & Retry** - Handles denied permissions
3. ✅ **Add User-Friendly Error Messages** - Explains what's wrong

### **High Priority (For Release Version)**

1. ⚠️ **App Usage Stats Workaround** - Document limitations or provide alternative
2. ⚠️ **Display Over Apps Fallback** - Gracefully handle denied overlay
3. ⚠️ **OEM-Specific Permission Guidance** - Show device-specific instructions

### **Medium Priority (Future Improvement)**

1. 🔮 **Accessibility-Based Tracking** - Alternative for app usage tracking
2. 🔮 **Notification-Based Alerts** - Alternative to overlay for notifications
3. 🔮 **Permission Status Dashboard** - Show which permissions are granted

---

## 📝 **IMPLEMENTATION CHECKLIST**

### **For Camera Permission Fix (Required Now)**

- [ ] Add `requestCameraPermission()` method to `MrpNativeModule.kt`
- [ ] Add `onRequestPermissionsResult()` override in `MainActivity.kt`
- [ ] Create permission request call in JavaScript
- [ ] Add user-friendly error message when permission denied
- [ ] Add retry mechanism with "Open Settings" button
- [ ] Test on Android 10+, 11+, 12+, 13+, 14+

### **For App Usage Stats (Document Now)**

- [ ] Create troubleshooting guide for different OEMs
- [ ] Document known limitations on Xiaomi/Samsung
- [ ] Provide alternative tracking method
- [ ] Add disclaimer in app about usage stats support

### **For Display Over Apps (Prepare Now)**

- [ ] Add graceful degradation when overlay denied
- [ ] Add fallback to notifications or other alerts
- [ ] Document limitations in help section
- [ ] Show user-friendly message about why overlay doesn't work

---

## 🚨 **USER COMMUNICATION**

### **What to Tell Users About App Usage Stats:**

> "App usage tracking requires manual permission on some devices (Xiaomi, Samsung, Huawei).
> Unfortunately, these manufacturers disable this permission for third-party apps.
> The feature will work on most other devices without any setup."

### **What to Tell Users About Display Over Apps:**

> "To capture photos on the lock screen, MRP needs permission to display over other apps.
> If this is not working, it may be due to your device manufacturer restrictions.
> Photos will still be captured when the screen is unlocked."

### **What to Tell Users About Camera Permission:**

> "MRP requires camera access to capture photos during security events.
> If you see a permission error, please:
> 1. Go to Settings > Apps > MRP > Permissions
> 2. Enable Camera
> 3. Restart the app"

---

## 📱 **TESTING CHECKLIST**

### **Test Camera Permission Request**

- [ ] Fresh install - permission request shown
- [ ] Tap "Allow" - camera works
- [ ] Tap "Deny" - error message shown with "Open Settings" option
- [ ] Return from Settings - permission still denied, retry option available
- [ ] Manually grant in Settings - app now works

### **Test App Usage Stats Permission**

- [ ] Xiaomi MIUI - confirm disabled, document
- [ ] Samsung - confirm disabled, document
- [ ] Huawei - confirm disabled, document
- [ ] Other OEMs - confirm works

### **Test Display Over Apps Permission**

- [ ] Xiaomi MIUI - confirm disabled, document
- [ ] Samsung - confirm disabled, document
- [ ] Other OEMs - confirm works, capture photos on lock screen

---

## 📊 **CONCLUSION**

These three bugs are **critical** and prevent core functionality:

1. **Camera Permission:** Most urgent - prevents any photo capture
2. **Display Over Apps:** High urgency - prevents lock-screen capture
3. **App Usage Stats:** Medium urgency - breaks one feature completely

**Recommendation:** Fix camera permission first (easiest, highest impact), then handle display over apps gracefully, and document app usage stats limitations.

---

## 🔄 **AFTER FIXES - MONITORING**

After implementing fixes, monitor:

1. Camera permission success rate
2. User complaints about missing features
3. OEM-specific permission issues reported

This will help identify if additional fixes are needed for specific manufacturers.
