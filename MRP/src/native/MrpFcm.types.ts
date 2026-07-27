import {NativeModules} from 'react-native';

type RegisterResult = {
  ok: boolean;
  reason?: string;
  token?: string;
  deviceId?: string;
  uid?: string;
};

type MrpFcmNative = {
  registerForCircleInvites(): Promise<RegisterResult>;
};

const native: MrpFcmNative | undefined = NativeModules.MrpFcm;

export async function registerFcmForCircleInvites(): Promise<RegisterResult> {
  if (!native?.registerForCircleInvites) {
    return {ok: false, reason: 'native_unavailable'};
  }
  return native.registerForCircleInvites();
}
