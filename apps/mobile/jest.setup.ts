// Global Jest mocks for native modules. The API itself is mocked per test via __tests__/helpers/api.ts (fetch).
/* eslint-disable @typescript-eslint/no-require-imports */


jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: {
        apiBaseUrl: 'https://api.test',
        publicAppUrl: 'https://metur100.github.io/Angebot.Pilot.App',
        legalBaseUrl: 'https://metur100.github.io/Angebot.Pilot.Landing',
      },
    },
  },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-network', () => ({
  useNetworkState: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
}));

jest.mock('expo-file-system', () => {
  class MockFile {
    static downloadFileAsync = jest.fn(async (_url: string, destination: MockFile) => destination);
    uri: string;
    exists = false;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    delete = jest.fn();
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache' }, document: { uri: 'file:///document' } } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: jest.fn(() => [{ granted: false, canAskAgain: true }, jest.fn()]),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const Picker = () => null;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});

