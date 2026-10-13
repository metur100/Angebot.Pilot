import { roleLabel } from '@angebotpilot/api-contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Divider, ListRow, SectionHeader } from '@/components/Card';
import { ContentScroll, Screen } from '@/components/Layout';
import { OptionSheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { APP_VERSION, legalUrls } from '@/lib/config';
import { openExternal } from '@/lib/forms';
import { logout, setActiveCompany, useMembership, useSession } from '@/lib/session';
import { colors, radius, space } from '@/theme';

function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export default function MoreScreen() {
  const router = useRouter();
  const { user, activeCompanyId } = useSession();
  const membership = useMembership();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const companies = user?.companies ?? [];

  const confirmLogout = () =>
    Alert.alert('Abmelden?', 'Ihre Sitzung wird auf diesem Gerät beendet.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        style: 'destructive',
        onPress: () => {
          setLoggingOut(true);
          void logout().finally(() => setLoggingOut(false));
        },
      },
    ]);

  return (
    <Screen>
      <ContentScroll>
        <View style={styles.profile}>
          <Text variant="heading">{user?.displayName}</Text>
          <Text variant="caption" tone="secondary">
            {user?.email}
          </Text>
        </View>

        <SectionHeader title="Unternehmen" />
        <Group>
          <ListRow
            icon="business-outline"
            label={membership?.companyName ?? 'Unternehmen'}
            value={membership ? roleLabel[membership.role] : undefined}
            onPress={() => router.push('/company')}
            testID="more-company"
          />
          {companies.length > 1 ? (
            <>
              <Divider />
              <ListRow icon="swap-horizontal-outline" label="Unternehmen wechseln" value={`${companies.length} Unternehmen`} onPress={() => setSwitchOpen(true)} />
            </>
          ) : null}
          <Divider />
          <ListRow icon="albums-outline" label="Vorlagen" value="Angebotsvorlagen ansehen" onPress={() => router.push('/templates')} />
        </Group>

        <SectionHeader title="Werkzeuge" />
        <Group>
          <ListRow icon="qr-code-outline" label="QR-Code scannen" value="Angebot vom Ausdruck öffnen" onPress={() => router.push('/scanner')} />
          <Divider />
          <ListRow icon="notifications-outline" label="Benachrichtigungen" onPress={() => router.push('/notifications')} />
        </Group>

        <SectionHeader title="Konto" />
        <Group>
          <ListRow icon="person-circle-outline" label="Mein Konto" value="Name, Passwort, Datenexport, Konto löschen" onPress={() => router.push('/profile')} testID="more-profile" />
          <Divider />
          <ListRow icon="log-out-outline" label={loggingOut ? 'Wird abgemeldet …' : 'Abmelden'} onPress={confirmLogout} destructive disabled={loggingOut} testID="more-logout" />
        </Group>

        <SectionHeader title="Rechtliches" />
        <Group>
          <ListRow icon="shield-checkmark-outline" label="Datenschutz" onPress={() => void openExternal(legalUrls.privacy)} external />
          <Divider />
          <ListRow icon="document-outline" label="AGB" onPress={() => void openExternal(legalUrls.terms)} external />
          <Divider />
          <ListRow icon="information-circle-outline" label="Impressum" onPress={() => void openExternal(legalUrls.imprint)} external />
        </Group>

        <Text variant="small" tone="muted" align="center" style={styles.version}>
          AngebotPilot {APP_VERSION} · © Medin Turkes
        </Text>
      </ContentScroll>

      <OptionSheet
        visible={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title="Unternehmen wechseln"
        options={companies.map((c) => ({ value: c.companyId, label: c.companyName, description: roleLabel[c.role] + (c.isDemo ? ' · Demo' : '') }))}
        selected={activeCompanyId}
        onSelect={(id) => void setActiveCompany(id)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { gap: 2, paddingHorizontal: space[1] },
  group: {
    backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  version: { marginTop: space[6] },
});
