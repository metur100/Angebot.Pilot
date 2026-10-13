import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles, radius, space, useTheme } from '@/theme';

import { Text } from './Text';

type ToastTone = 'success' | 'error' | 'info';
interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ id: Date.now(), message, tone });
    AccessibilityInfo.announceForAccessibility?.(message);
  }, []);
  const value = useMemo(() => show, [show]);
  const hide = useCallback(() => setToast(null), []);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDone={hide} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDone }: { toast: ToastState; onDone: () => void }) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onDone());
    }, 3200);
    return () => clearTimeout(timer);
  }, [opacity, onDone]);
  const icon = toast.tone === 'success' ? 'checkmark-circle' : toast.tone === 'error' ? 'alert-circle' : 'information-circle';
  const iconColor = toast.tone === 'success' ? colors.palette.success.solid : toast.tone === 'error' ? colors.palette.danger.solid
    : scheme === 'dark' ? colors.brandDark : colors.brandBorder;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 72 }]}>
      <Animated.View style={[styles.toast, { opacity }]} accessibilityLiveRegion="polite" testID="toast">
        <Ionicons name={icon} size={20} color={iconColor} />
        <Text variant="caption" tone="inverse" style={styles.text}>
          {toast.message}
        </Text>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  wrap: { position: 'absolute', left: space[4], right: space[4], alignItems: 'center' },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: colors.inverseSurface,
    borderRadius: radius.lg, paddingHorizontal: space[4], paddingVertical: space[3], maxWidth: 480, ...shadow.raised,
  },
  text: { flexShrink: 1, fontWeight: '500' },
}));
