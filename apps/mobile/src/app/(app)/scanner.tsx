import { errorMessage } from '@angebotpilot/api-contracts';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/Button';
import { TextField } from '@/components/Field';
import { FormScroll } from '@/components/Layout';
import { Text } from '@/components/Text';
import { resolveScan } from '@/features/scanner/resolveScan';
import { api, useCompanyId } from '@/lib/session';
import { colors, radius, space } from '@/theme';

export default function ScannerScreen() {
  const router = useRouter();
  const companyId = useCompanyId();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const handling = useRef(false);

  const handle = async (data: string) => {
    if (handling.current) return;
    handling.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await resolveScan(api, companyId, data);
      if (result.kind === 'invalid') {
        setMessage('Dieser QR-Code gehört zu keinem AngebotPilot-Angebot.');
        setTimeout(() => {
          handling.current = false;
        }, 1500);
        return;
      }
      router.replace(result.path as never);
    } catch (error) {
      setMessage(errorMessage(error));
      handling.current = false;
    } finally {
      setBusy(false);
    }
  };

  const onScanned = (result: BarcodeScanningResult) => void handle(result.data);

  const header = (
    <View style={styles.header}>
      <IconButton icon="close" accessibilityLabel="Scanner schließen" color={permission?.granted ? colors.onBrand : colors.text} onPress={() => router.back()} testID="scanner-close" />
      <Text variant="heading" tone={permission?.granted ? 'inverse' : 'default'}>
        QR-Code scannen
      </Text>
    </View>
  );

  const manualEntry = (
    <View style={styles.manual}>
      <TextField
        label="Oder Link manuell eingeben"
        value={manual}
        onChangeText={setManual}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://…/q/…"
        testID="scanner-manual"
      />
      <Button label="Öffnen" variant="outline" onPress={() => void handle(manual)} disabled={!manual.trim()} loading={busy} />
    </View>
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.light}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: space[10] }} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.light}>
        {header}
        <FormScroll>
          <View style={styles.permission}>
            <Ionicons name="camera-outline" size={40} color={colors.brand} />
            <Text variant="heading" align="center">
              Kamerazugriff für den QR-Scanner
            </Text>
            <Text variant="body" tone="secondary" align="center">
              Die Kamera wird nur zum Scannen von Angebots-QR-Codes verwendet. Es werden keine Fotos gespeichert.
            </Text>
            {permission.canAskAgain ? (
              <Button label="Kamera erlauben" icon="camera-outline" onPress={() => void requestPermission()} testID="scanner-allow" />
            ) : (
              <Button label="Einstellungen öffnen" icon="settings-outline" onPress={() => void Linking.openSettings()} />
            )}
          </View>
          {message ? <Text variant="caption" tone="danger" accessibilityRole="alert">{message}</Text> : null}
          {manualEntry}
        </FormScroll>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.dark}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : onScanned} />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        {header}
        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} accessibilityLabel="Scanbereich" />
        </View>
        <View style={styles.bottom}>
          {busy ? <ActivityIndicator color={colors.onBrand} /> : null}
          <Text variant="body" tone="inverse" align="center" accessibilityLiveRegion="polite">
            {message ?? 'Richten Sie die Kamera auf den QR-Code im Angebots-PDF.'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  light: { flex: 1, backgroundColor: colors.background },
  dark: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[2], minHeight: 56 },
  frameWrap: { alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: radius.xl, borderWidth: 3, borderColor: colors.onBrand },
  bottom: { padding: space[6], gap: space[2], backgroundColor: 'rgba(0,0,0,0.45)' },
  permission: { alignItems: 'center', gap: space[3], paddingVertical: space[6] },
  manual: { gap: space[2], marginTop: space[4] },
});
