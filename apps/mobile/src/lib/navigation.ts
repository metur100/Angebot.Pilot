import { colors } from '@/theme';

/** Shared native-stack header styling. */
export const stackScreenOptions = {
  headerTintColor: colors.brand,
  headerTitleStyle: { color: colors.text, fontWeight: '600' as const },
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: true,
  contentStyle: { backgroundColor: colors.background },
  headerBackButtonDisplayMode: 'minimal' as const,
};
