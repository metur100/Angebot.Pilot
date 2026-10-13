import type { ConfigContext, ExpoConfig } from 'expo/config';

// Dynamic Expo config. Everything native lives here (Continuous Native Generation): android/ and ios/ are generated
// by `expo prebuild` and are git-ignored.
//
// Environment variables
//   APP_ID                     Android package + iOS bundle identifier (default com.certidevelopment.angebotpilot)
//   EXPO_PUBLIC_API_BASE_URL   API origin without /api/v1 (default https://angebotpilot.runasp.net).
//                              Local emulator testing: http://10.0.2.2:5080 – only then is cleartext HTTP
//                              allowed, and only for 10.0.2.2/localhost (see plugins/withLocalCleartext.js).

const APP_ID = process.env.APP_ID?.trim() || 'com.certidevelopment.angebotpilot';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'https://angebotpilot.runasp.net').replace(/\/+$/, '');
const usesLocalHttpApi = API_BASE_URL.startsWith('http://');

const BRAND = '#2F45D8';
// Default (German) permission text; localized variants live in locales/*.json (iOS InfoPlist.strings).
const CAMERA_USAGE = 'Die Kamera wird nur zum Scannen von Angebots-QR-Codes verwendet.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'AngebotPilot',
  slug: 'angebotpilot',
  scheme: 'angebotpilot',
  owner: undefined,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  // Light/dark follow the system unless the user picks a theme in the app (Appearance.setColorScheme).
  userInterfaceStyle: 'automatic',
  backgroundColor: '#F6F7F9',
  primaryColor: BRAND,
  description: 'Angebote erstellen, nachfassen, Aufträge gewinnen – AngebotPilot für kleine Betriebe.',
  githubUrl: 'https://github.com/metur100/Angebot.Pilot',
  platforms: ['android', 'ios'],
  ios: {
    bundleIdentifier: APP_ID,
    buildNumber: '1',
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: CAMERA_USAGE,
      CFBundleDevelopmentRegion: 'de',
      CFBundleLocalizations: ['de', 'en'],
      CFBundleAllowMixedLocalizations: true,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      // Data the user enters and the app sends to the AngebotPilot API (no tracking, no third-party SDKs).
      NSPrivacyCollectedDataTypes: [
        'NSPrivacyCollectedDataTypeEmailAddress',
        'NSPrivacyCollectedDataTypeName',
        'NSPrivacyCollectedDataTypePhoneNumber',
        'NSPrivacyCollectedDataTypePhysicalAddress',
        'NSPrivacyCollectedDataTypeUserID',
        'NSPrivacyCollectedDataTypeOtherUserContent',
      ].map((type) => ({
        NSPrivacyCollectedDataType: type,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
      })),
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
    },
  },
  android: {
    package: APP_ID,
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      monochromeImage: './assets/images/adaptive-icon-monochrome.png',
      backgroundColor: BRAND,
    },
    // ACCESS_NETWORK_STATE is a normal (install-time, no prompt) permission used by expo-network for the offline banner.
    permissions: ['android.permission.CAMERA', 'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.VIBRATE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'android.permission.ACCESS_WIFI_STATE',
      'android.permission.FOREGROUND_SERVICE',
    ],
    predictiveBackGestureEnabled: false,
  },
  // UI languages: German (default) and English. Native strings (permission prompts) per language.
  locales: { de: './locales/de.json', en: './locales/en.json' },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { image: './assets/images/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: BRAND, dark: { backgroundColor: BRAND } },
    ],
    [
      'expo-camera',
      { cameraPermission: CAMERA_USAGE, microphonePermission: false, recordAudioAndroid: false, barcodeScannerEnabled: true },
    ],
    ['expo-secure-store', { faceIDPermission: false, configureAndroidBackup: true }],
    'expo-font',
    'expo-web-browser',
    './plugins/withAndroidReleaseSigning',
    './plugins/withLocalCmakeDir',
    ...(usesLocalHttpApi ? ['./plugins/withLocalCleartext'] : []),
  ],
  experiments: {
    typedRoutes: false,
    // tsconfig "paths" are for the TypeScript checker only (they map big.js to its @types package);
    // Metro resolves the "@/" alias itself (metro.config.js).
    tsconfigPaths: false,
  },
  extra: {
    apiBaseUrl: API_BASE_URL,
    publicAppUrl: 'https://metur100.github.io/Angebot.Pilot.App',
    legalBaseUrl: 'https://metur100.github.io/Angebot.Pilot.Landing',
    router: {},
  },
});
