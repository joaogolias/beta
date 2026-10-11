import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

export type NativeStreakState = {
  ownerId: string;
  currentStreak: number;
  lastActiveDate: string | null;
  restartedOnDate: string | null;
  remindersEnabled: boolean;
};

type StreakModule = {
  syncStreak(state: NativeStreakState): Promise<void>;
  clearStreak(): Promise<void>;
  notificationsAllowed(): Promise<boolean>;
  requestWidgetPin(): Promise<boolean>;
};

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<StreakModule>('BetaStreak')
    : null;

export function isStreakNativeAvailable(): boolean {
  return native !== null;
}

export async function syncStreakNative(
  state: NativeStreakState,
): Promise<void> {
  await native?.syncStreak(state);
}

export async function clearStreakNative(): Promise<void> {
  await native?.clearStreak();
}

export async function getStreakNotificationPermission(): Promise<boolean> {
  return (await native?.notificationsAllowed()) ?? false;
}

/** Invoke only from the reminder opt-in action, never automatically on app startup. */
export async function requestStreakNotificationPermission(): Promise<boolean> {
  if (!native) return false;
  if (Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  return native.notificationsAllowed();
}

/** False means the launcher does not support in-app pinning; manual placement still works. */
export async function requestStreakWidgetPin(): Promise<boolean> {
  return (await native?.requestWidgetPin()) ?? false;
}
