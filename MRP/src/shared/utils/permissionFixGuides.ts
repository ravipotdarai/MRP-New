/**
 * Shared copy for Android SMS permission friction
 * (sideload “restricted settings”).
 */
import {Alert} from 'react-native';

export const SMS_RESTRICTED_TITLE = 'SMS blocked or restricted';

export const SMS_RESTRICTED_BODY =
  'MRP only sends outbound SMS for Panic / SIM recovery to contacts you chose — it does not read your inbox.\n\n' +
  'If “Allow” is greyed out or you see “App was denied access”:\n' +
  '1. Settings → Apps → MRP\n' +
  '2. Tap ⋮ (three dots) → Allow restricted settings → Allow\n' +
  '3. Open Permissions → SMS → Allow\n\n' +
  'On some phones: Permissions → ⋮ → All permissions → SMS.';

export function showSmsPermissionHelp(openAppSettings?: () => void | Promise<unknown>) {
  Alert.alert(SMS_RESTRICTED_TITLE, SMS_RESTRICTED_BODY, [
    {text: 'Cancel', style: 'cancel'},
    {
      text: 'Open App Settings',
      onPress: () => {
        void openAppSettings?.();
      },
    },
  ]);
}
