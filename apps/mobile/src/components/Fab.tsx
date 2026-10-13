import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { makeStyles, radius, space, useTheme } from '@/theme';

import type { IconName } from './Button';
import { Text } from './Text';

/** Extended floating action button (icon + label) for the primary action of a list screen. */
export function Fab({ label, icon, onPress, testID }: { label: string; icon: IconName; onPress: () => void; testID?: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.fab, pressed ? { backgroundColor: colors.brandPressed } : null]}
    >
      <Ionicons name={icon} size={22} color={colors.onBrand} />
      <Text variant="bodyStrong" tone="inverse">
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  fab: {
    position: 'absolute', right: space[4], bottom: space[4], flexDirection: 'row', alignItems: 'center', gap: space[2],
    backgroundColor: colors.brand, borderRadius: radius.full, paddingHorizontal: space[5], minHeight: 56, ...shadow.raised,
  },
}));
