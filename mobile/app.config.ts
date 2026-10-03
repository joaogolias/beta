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
  slug: 'babel-crux',
  version: process.env.APP_VERSION ?? '0.1.0',
  platforms: ['android'],
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  scheme: appEnv === 'production' ? 'babelcrux' : 'babelcrux-dev',
  icon: './assets/icon.png',
  android: {
    package:
      appEnv === 'production' ? 'com.babelcrux.app' : 'com.babelcrux.app.dev',
    versionCode,
    predictiveBackGestureEnabled: true,
    adaptiveIcon: {
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
      backgroundImage: './assets/android-icon-background.png',
      backgroundColor: '#66717C',
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
