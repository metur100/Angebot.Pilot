// Bottom sheet built on the native Modal. Android's hardware back button closes the sheet first (onRequestClose)
// before the underlying screen handles it.
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/theme';

import { IconButton, type IconName } from './Button';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
  /** Fill most of the screen (e.g. pickers with search). */
  tall?: boolean;
  scroll?: boolean;
}

export function Sheet({ visible, onClose, title, children, footer, testID, tall, scroll = true }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} testID={testID}>
      {/* 'padding' pads by the measured overlap between sheet and keyboard, so it also works when Android does not resize the
          (edge-to-edge) dialog window – and adds nothing when it does. */}
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Schließen" />
        <View
          style={[styles.sheet, tall ? styles.tall : null, { paddingBottom: Math.max(insets.bottom, space[3]) }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="heading" accessibilityRole="header" style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel="Schließen" onPress={onClose} testID="sheet-close" />
          </View>
          {scroll ? (
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.bodyContent, styles.flex]}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: IconName;
  destructive?: boolean;
}

/** A list of choices in a sheet (select field / action sheet). */
export function OptionSheet<T extends string>({
  visible, onClose, title, options, selected, onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: SheetOption<T>[];
  selected?: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.options}>
        {options.map((o) => {
          const isSelected = o.value === selected;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, checked: isSelected }}
              accessibilityLabel={o.description ? `${o.label}, ${o.description}` : o.label}
              onPress={() => {
                onSelect(o.value);
                onClose();
              }}
              style={({ pressed }) => [styles.option, isSelected ? styles.optionSelected : null, pressed ? styles.optionPressed : null]}
              testID={`option-${o.value}`}
            >
              {o.icon ? <Ionicons name={o.icon} size={22} color={o.destructive ? colors.danger : colors.textSecondary} /> : null}
              <View style={styles.flex}>
                <Text variant="body" tone={o.destructive ? 'danger' : 'default'}>
                  {o.label}
                </Text>
                {o.description ? (
                  <Text variant="caption" tone="muted">
                    {o.description}
                  </Text>
                ) : null}
              </View>
              {isSelected ? <Ionicons name="checkmark" size={22} color={colors.brand} /> : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.xl + 4, borderTopRightRadius: radius.xl + 4,
    maxHeight: '92%', paddingTop: space[2],
  },
  tall: { height: '92%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space[1] },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: space[4], paddingRight: space[2] },
  title: { flex: 1 },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: space[4], paddingBottom: space[4], gap: space[3] },
  flex: { flex: 1 },
  footer: {
    paddingHorizontal: space[4], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    gap: space[2],
  },
  options: { gap: space[1] },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[3],
    paddingVertical: space[2], borderRadius: radius.lg,
  },
  optionSelected: { backgroundColor: colors.brandSoft },
  optionPressed: { backgroundColor: colors.surfaceMuted },
});
