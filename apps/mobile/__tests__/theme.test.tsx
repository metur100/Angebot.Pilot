import { colors as lightPalette, darkColors } from '@angebotpilot/brand';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { PREFERENCE_KEYS, setThemePreference } from '@/lib/preferences';
import { SECURE_KEYS } from '@/lib/session';
import { ThemeProvider, themes, useTheme } from '@/theme';

import { mockApi } from './helpers/api';
import { auth, c, dashboard, page } from './helpers/fixtures';
import { resetAll } from './helpers/render';

let mockSystemScheme: 'light' | 'dark' | null = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockSystemScheme }));

const SecureStore = jest.requireMock('expo-secure-store') as { __store: Map<string, string> };

function Probe() {
  const { scheme, colors } = useTheme();
  return <Text testID="probe">{`${scheme} ${colors.background} ${colors.surface} ${colors.text}`}</Text>;
}

beforeEach(() => {
  resetAll();
  mockSystemScheme = 'light';
});

describe('ThemeProvider', () => {
  it('uses the light palette by default', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('probe').props.children).toBe(`light ${lightPalette.neutral[50]} ${lightPalette.neutral[0]} ${lightPalette.neutral[900]}`);
  });

  it("picks the dark palette for the 'dark' preference", async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(() => setThemePreference('dark'));
    expect(screen.getByTestId('probe').props.children).toBe(`dark ${darkColors.neutral[50]} ${darkColors.neutral[0]} ${darkColors.neutral[900]}`);
    expect(SecureStore.__store.get(PREFERENCE_KEYS.theme)).toBe('dark');
  });

  it("follows a dark system appearance for the 'system' preference", () => {
    mockSystemScheme = 'dark';
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('probe').props.children).toMatch(/^dark /);
  });

  it("keeps light when the user chose 'light' on a dark system", async () => {
    mockSystemScheme = 'dark';
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await act(() => setThemePreference('light'));
    expect(screen.getByTestId('probe').props.children).toMatch(/^light /);
  });

  it('builds per-scheme colour tokens with readable brand text on dark surfaces', () => {
    expect(themes.dark.colors.brandText).toBe(darkColors.brand[700]);
    expect(themes.dark.colors.brand).toBe(darkColors.brand[600]);
    expect(themes.light.colors.brandText).toBe(lightPalette.brand[600]);
  });
});

describe('theme switch in the app', () => {
  it('restores the stored theme and switches screens to dark from "More"', async () => {
    SecureStore.__store.set(SECURE_KEYS.refreshToken, 'refresh-1');
    mockApi({
      'POST /auth/refresh': { body: auth() },
      [`GET ${c('/dashboard')}`]: { body: dashboard },
      [`GET ${c('/notifications/unread-count')}`]: { body: { count: 0 } },
      [`GET ${c('/quotations')}`]: { body: page([]) },
    });
    renderRouter('./src/app', { initialUrl: '/more' });
    const logout = await screen.findByTestId('more-logout');
    const before = screen.getByText('Abmelden');
    expect(before.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: themes.light.colors.danger })]));
    expect(logout).toBeTruthy();

    fireEvent.press(screen.getByTestId('segment-dark'));

    await waitFor(() =>
      expect(screen.getByText('Abmelden').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: themes.dark.colors.danger })])),
    );
    expect(SecureStore.__store.get(PREFERENCE_KEYS.theme)).toBe('dark');
  });
});
