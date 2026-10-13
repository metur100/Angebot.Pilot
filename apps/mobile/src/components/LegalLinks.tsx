import { Pressable, StyleSheet, View } from 'react-native';

import { legalUrls } from '@/lib/config';
import { openExternal } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { space, touch } from '@/theme';

import { Text } from './Text';

export function LegalLinks() {
  const { tr } = useLocale();
  // The legal pages themselves are German (German company, German law).
  const links = [
    { key: 'privacy', label: tr('Datenschutz', 'Privacy'), url: legalUrls.privacy },
    { key: 'terms', label: tr('AGB', 'Terms'), url: legalUrls.terms },
    { key: 'imprint', label: tr('Impressum', 'Legal notice'), url: legalUrls.imprint },
  ];
  return (
    <View style={styles.row}>
      {links.map((l) => (
        <Pressable
          key={l.key}
          accessibilityRole="link"
          accessibilityLabel={tr(`${l.label} (öffnet im Browser)`, `${l.label} (opens in browser)`)}
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
