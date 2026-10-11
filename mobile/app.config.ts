import type { ExpoConfig } from 'expo/config';

const appEnv = process.env.APP_ENV ?? 'development';
if (appEnv !== 'development' && appEnv !== 'production') {
  throw new Error('APP_ENV deve ser development ou production.');
}
const versionCode = Number(process.env.ANDROID_VERSION_CODE ?? '1');
if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error('ANDROID_VERSION_CODE deve ser um inteiro positivo.');
}

const config: ExpoConfig = {
  name: 'beta',
  slug: 'beta',
  version: process.env.APP_VERSION ?? '0.1.0',
  platforms: ['android'],
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: '#F5F1E8',
  scheme: appEnv === 'production' ? 'beta' : 'beta-dev',
  icon: appEnv === 'production' ? './assets/icon.png' : './assets/icon-dev.png',
  android: {
    package: appEnv === 'production' ? 'com.beta.app' : 'com.beta.app.dev',
    versionCode,
    predictiveBackGestureEnabled: true,
    adaptiveIcon: {
      foregroundImage:
        appEnv === 'production'
          ? './assets/android-icon-foreground.png'
          : './assets/android-icon-foreground-dev.png',
      monochromeImage:
        appEnv === 'production'
          ? './assets/android-icon-monochrome.png'
          : './assets/android-icon-monochrome-dev.png',
      backgroundImage: './assets/android-icon-background.png',
      backgroundColor: '#696557',
    },
  },
  plugins: [
    [
      'expo-audio',
      {
        recordAudioAndroid: false,
        microphonePermission: false,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    'expo-secure-store',
    'expo-sqlite',
    'expo-system-ui',
    'expo-web-browser',
    '@clerk/expo',
    './plugins/withReleaseSigning.cjs',
  ],
  extra: { appEnv },
};

export default config;
