import { Pressable, StyleSheet, View } from 'react-native';

import { legalUrls } from '@/lib/config';
import { openExternal } from '@/lib/forms';
import { space, touch } from '@/theme';

import { Text } from './Text';

const links = [
  { label: 'Datenschutz', url: legalUrls.privacy },
  { label: 'AGB', url: legalUrls.terms },
  { label: 'Impressum', url: legalUrls.imprint },
];

export function LegalLinks() {
  return (
    <View style={styles.row}>
      {links.map((l) => (
        <Pressable
          key={l.label}
          accessibilityRole="link"
          accessibilityLabel={`${l.label} (öffnet im Browser)`}
          onPress={() => void openExternal(l.url)}
          style={styles.link}
        >
          <Text variant="caption" tone="secondary" style={styles.text}>
            {l.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space[2] },
  link: { minHeight: touch, minWidth: touch, justifyContent: 'center', paddingHorizontal: space[2] },
  text: { textDecorationLine: 'underline' },
});
