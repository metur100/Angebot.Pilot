import { roleLabel } from '@angebotpilot/api-contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Divider, ListRow, SectionHeader } from '@/components/Card';
import { ContentScroll, Screen } from '@/components/Layout';
import { LanguageSwitcher, ThemeSwitcher } from '@/components/Preferences';
import { OptionSheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { APP_VERSION, legalUrls } from '@/lib/config';
import { openExternal } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { logout, setActiveCompany, useMembership, useSession } from '@/lib/session';
import { makeStyles, radius, space } from '@/theme';

function Group({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.group}>{children}</View>;
}

export default function MoreScreen() {
  const router = useRouter();
  const { tr } = useLocale();
  const styles = useStyles();
  const { user, activeCompanyId } = useSession();
  const membership = useMembership();
  const [switchOpen, setSwitchOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const companies = user?.companies ?? [];

  const confirmLogout = () =>
    Alert.alert(tr('Abmelden?', 'Sign out?'), tr('Ihre Sitzung wird auf diesem Gerät beendet.', 'Your session on this device will be ended.'), [
      { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
      {
        text: tr('Abmelden', 'Sign out'),
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

        <SectionHeader title={tr('Rechnungen', 'Invoices')} />
        <Group>
          <ListRow
            icon="receipt-outline"
            label={tr('Rechnungen', 'Invoices')}
            value={tr('Rechnungen stellen, versenden und Zahlungen erfassen', 'Issue and send invoices, record payments')}
            onPress={() => router.push('/invoices')}
            testID="more-invoices"
          />
        </Group>

        <SectionHeader title={tr('Unternehmen', 'Company')} />
        <Group>
          <ListRow
            icon="business-outline"
            label={membership?.companyName ?? tr('Unternehmen', 'Company')}
            value={membership ? roleLabel[membership.role] : undefined}
            onPress={() => router.push('/company')}
            testID="more-company"
          />
          {companies.length > 1 ? (
            <>
              <Divider />
              <ListRow
                icon="swap-horizontal-outline"
                label={tr('Unternehmen wechseln', 'Switch company')}
                value={tr(`${companies.length} Unternehmen`, `${companies.length} companies`)}
                onPress={() => setSwitchOpen(true)}
              />
            </>
          ) : null}
          <Divider />
          <ListRow
            icon="albums-outline"
            label={tr('Vorlagen', 'Templates')}
            value={tr('Angebotsvorlagen ansehen', 'View quotation templates')}
            onPress={() => router.push('/templates')}
          />
        </Group>

        <SectionHeader title={tr('Werkzeuge', 'Tools')} />
        <Group>
          <ListRow
            icon="qr-code-outline"
            label={tr('QR-Code scannen', 'Scan QR code')}
            value={tr('Angebot vom Ausdruck öffnen', 'Open a quotation from a printout')}
            onPress={() => router.push('/scanner')}
          />
          <Divider />
          <ListRow icon="notifications-outline" label={tr('Benachrichtigungen', 'Notifications')} onPress={() => router.push('/notifications')} />
        </Group>

        <SectionHeader title={tr('Darstellung', 'Display')} />
        <View style={styles.preferences}>
          <Text variant="label" tone="secondary">
            {tr('Sprache', 'Language')}
          </Text>
          <LanguageSwitcher />
          <Text variant="caption" tone="muted">
            {tr(
              'Angebote, Rechnungen und E-Mails an Kunden bleiben auf Deutsch.',
              'Quotations, invoices and emails to customers stay in German.',
            )}
          </Text>
          <Text variant="label" tone="secondary" style={styles.preferenceLabel}>
            {tr('Farbschema', 'Theme')}
          </Text>
          <ThemeSwitcher />
        </View>

        <SectionHeader title={tr('Konto', 'Account')} />
        <Group>
          <ListRow
            icon="person-circle-outline"
            label={tr('Mein Konto', 'My account')}
            value={tr('Name, Passwort, Datenexport, Konto löschen', 'Name, password, data export, delete account')}
            onPress={() => router.push('/profile')}
            testID="more-profile"
          />
          <Divider />
          <ListRow
            icon="log-out-outline"
            label={loggingOut ? tr('Wird abgemeldet …', 'Signing out …') : tr('Abmelden', 'Sign out')}
            onPress={confirmLogout}
            destructive
            disabled={loggingOut}
            testID="more-logout"
          />
        </Group>

        <SectionHeader title={tr('Rechtliches', 'Legal')} />
        <Group>
          <ListRow icon="shield-checkmark-outline" label={tr('Datenschutz', 'Privacy')} onPress={() => void openExternal(legalUrls.privacy)} external />
          <Divider />
          <ListRow icon="document-outline" label={tr('AGB', 'Terms and conditions')} onPress={() => void openExternal(legalUrls.terms)} external />
          <Divider />
          <ListRow icon="information-circle-outline" label={tr('Impressum', 'Legal notice')} onPress={() => void openExternal(legalUrls.imprint)} external />
        </Group>

        <Text variant="small" tone="muted" align="center" style={styles.version}>
          AngebotPilot {APP_VERSION} · © Medin Turkes
        </Text>
      </ContentScroll>

      <OptionSheet
        visible={switchOpen}
        onClose={() => setSwitchOpen(false)}
        title={tr('Unternehmen wechseln', 'Switch company')}
        options={companies.map((c) => ({ value: c.companyId, label: c.companyName, description: roleLabel[c.role] + (c.isDemo ? ' · Demo' : '') }))}
        selected={activeCompanyId}
        onSelect={(id) => void setActiveCompany(id)}
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  profile: { gap: 2, paddingHorizontal: space[1] },
  group: {
    backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  preferences: {
    backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: space[4], gap: space[2],
  },
  preferenceLabel: { marginTop: space[2] },
  version: { marginTop: space[6] },
}));
