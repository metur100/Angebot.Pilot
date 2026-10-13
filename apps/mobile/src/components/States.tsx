import { errorMessage } from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { Button, type IconName } from './Button';
import { Text } from './Text';

export function EmptyState({
  icon, title, message, actionLabel, onAction, testID,
}: { icon: IconName; title: string; message?: string; actionLabel?: string; onAction?: () => void; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.center} testID={testID}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={30} color={colors.brandText} />
      </View>
      <Text variant="heading" align="center" accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="secondary" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} fullWidth={false} style={styles.action} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const { tr } = useLocale();
  const styles = useStyles();
  return (
    <View style={compact ? styles.compact : styles.center} accessibilityRole="alert" testID="error-state">
      <Ionicons name="cloud-offline-outline" size={compact ? 22 : 32} color={colors.danger} />
      <Text variant="body" align="center" style={styles.message}>
        {errorMessage(error)}
      </Text>
      {onRetry ? <Button label={tr('Erneut versuchen', 'Try again')} icon="refresh" variant="outline" onPress={onRetry} fullWidth={false} /> : null}
    </View>
  );
}

export function InlineError({ message, testID }: { message: string | null | undefined; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (!message) return null;
  return (
    <View style={styles.inlineError} accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID ?? 'form-error'}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text variant="caption" tone="danger" style={styles.flex}>
        {message}
      </Text>
    </View>
  );
}

export function LoadingView({ label }: { label?: string }) {
  const { colors } = useTheme();
  const { tr } = useLocale();
  const styles = useStyles();
  return (
    <View style={styles.center} accessibilityLabel={label ?? tr('Wird geladen …', 'Loading …')} accessibilityRole="progressbar">
      <ActivityIndicator size="large" color={colors.brandText} />
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: object }) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, opacity, backgroundColor: colors.skeleton, borderRadius: radius.md }, style]} />;
}

/** Placeholder cards shown while a list loads. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const { tr } = useLocale();
  const styles = useStyles();
  return (
    <View style={styles.skeletonList} accessibilityLabel={tr('Wird geladen', 'Loading')} accessibilityRole="progressbar" testID="list-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton height={14} width="40%" />
          <Skeleton height={18} width="80%" />
          <Skeleton height={14} width="55%" />
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[3] },
  compact: { alignItems: 'center', padding: space[4], gap: space[2] },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
    marginBottom: space[1],
  },
  message: { maxWidth: 360 },
  action: { marginTop: space[2] },
  inlineError: {
    flexDirection: 'row', gap: space[2], alignItems: 'flex-start', padding: space[3], borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.palette.danger.border,
  },
  flex: { flex: 1 },
  skeletonList: { padding: space[4], gap: space[3] },
  skeletonCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, padding: space[4], gap: space[2],
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
}));
