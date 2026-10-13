import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

const icon = require('../../assets/images/splash-icon.png');

/** Branded loading screen while the session is restored (stored refresh token → new access token). */
export function SplashView({ offline, onRetry }: { offline?: boolean; onRetry?: () => void }) {
  return (
    <SafeAreaView style={styles.root} testID="splash">
      <View style={styles.center}>
        <Image source={icon} style={styles.icon} accessibilityIgnoresInvertColors accessible={false} />
        <Text variant="title" tone="inverse" accessibilityRole="header">
          AngebotPilot
        </Text>
        {offline ? (
          <View style={styles.offline} accessibilityRole="alert">
            <Text variant="body" tone="inverse" align="center">
              Keine Verbindung zum Server. Bitte prüfen Sie Ihre Internetverbindung.
            </Text>
            <Button label="Erneut versuchen" icon="refresh" variant="secondary" onPress={onRetry} fullWidth={false} testID="splash-retry" />
          </View>
        ) : (
          <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Anmeldung wird geprüft">
            <ActivityIndicator color={colors.onBrand} />
            <Text variant="caption" tone="inverse">
              Anmeldung wird geprüft …
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.brand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[3] },
  icon: { width: 180, height: 180, marginBottom: -space[6] },
  progress: { marginTop: space[6], alignItems: 'center', gap: space[2] },
  offline: { marginTop: space[6], alignItems: 'center', gap: space[4] },
});
