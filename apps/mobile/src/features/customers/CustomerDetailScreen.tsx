import { customerTypeLabel, errorMessage, formatDateTime, type CustomerDto } from '@angebotpilot/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card, KeyValue, SectionHeader } from '@/components/Card';
import { JobCard, QuotationCard } from '@/components/EntityCards';
import { ContentScroll, Screen } from '@/components/Layout';
import { OptionSheet } from '@/components/Sheet';
import { Badge } from '@/components/StatusBadge';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { keys, useCustomer, useCustomerJobs, useCustomerQuotations } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { space } from '@/theme';

function address(street: string | null, postal: string | null, city: string | null, country: string | null): string | null {
  const line2 = [postal, city].filter(Boolean).join(' ');
  const parts = [street, line2, country && country !== 'DE' ? country : null].filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

async function openUrl(url: string, failMessage: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Nicht möglich', failMessage);
  }
}

type MenuAction = 'edit' | 'archive' | 'unarchive' | 'delete';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useCompanyId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const customer = useCustomer(id);
  const quotations = useCustomerQuotations(id);
  const jobs = useCustomerJobs(id);
  const [menuOpen, setMenuOpen] = useState(false);

  const c = customer.data;

  const update = (updated: CustomerDto) => {
    queryClient.setQueryData(keys.customer(companyId, updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: keys.customers(companyId) });
  };

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      Alert.alert('Aktion fehlgeschlagen', errorMessage(error));
    }
  };

  const onMenu = (action: MenuAction) => {
    if (!c) return;
    if (action === 'edit') router.push({ pathname: '/customer-form', params: { id: c.id } });
    if (action === 'archive') void run(async () => { update(await api.customers.archive(companyId, c.id)); toast('Kunde archiviert'); });
    if (action === 'unarchive') void run(async () => { update(await api.customers.unarchive(companyId, c.id)); toast('Kunde wiederhergestellt'); });
    if (action === 'delete') {
      Alert.alert(
        'Kunde löschen?',
        'Kunden ohne Angebote und Aufträge werden endgültig gelöscht. Bei vorhandenen Belegen werden die personenbezogenen Daten anonymisiert (Aufbewahrungspflichten).',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Löschen',
            style: 'destructive',
            onPress: () =>
              void run(async () => {
                const res = await api.customers.delete(companyId, c.id);
                void queryClient.invalidateQueries({ queryKey: keys.customers(companyId) });
                queryClient.removeQueries({ queryKey: keys.customer(companyId, c.id) });
                toast(res.result === 'deleted' ? 'Kunde gelöscht' : 'Kundendaten anonymisiert');
                router.back();
              }),
          },
        ],
      );
    }
  };

  if (customer.isPending) return <Screen><ListSkeleton rows={3} /></Screen>;
  if (customer.isError || !c) {
    return (
      <Screen>
        <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />
      </Screen>
    );
  }

  const contact = [c.salutation, c.firstName, c.lastName].filter(Boolean).join(' ');
  const billing = address(c.billingStreet, c.billingPostalCode, c.billingCity, c.billingCountry);
  const service = c.hasServiceAddress ? address(c.serviceStreet, c.servicePostalCode, c.serviceCity, c.serviceCountry) : null;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: c.displayName,
          headerRight: () => <IconButton icon="ellipsis-horizontal-circle-outline" accessibilityLabel="Kundenaktionen" onPress={() => setMenuOpen(true)} testID="customer-menu" />,
        }}
      />
      <ContentScroll
        refreshing={customer.isRefetching}
        onRefresh={() => {
          void customer.refetch();
          void quotations.refetch();
          void jobs.refetch();
        }}
        testID="customer-detail"
      >
        <Card style={styles.gap}>
          <View style={styles.badges}>
            <Badge label={customerTypeLabel[c.type]} tone="info" icon={c.type === 'Business' ? 'business-outline' : 'person-outline'} />
            {c.isArchived ? <Badge label="Archiviert" tone="muted" icon="archive-outline" /> : null}
            {c.followUpOptOut ? <Badge label="Keine Erinnerungen" tone="warning" icon="notifications-off-outline" /> : null}
          </View>
          <Text variant="title" accessibilityRole="header">
            {c.displayName}
          </Text>
          {contact && c.type === 'Business' ? <Text variant="body" tone="secondary">{contact}</Text> : null}
          <View style={styles.contactRow}>
            <Button
              label="Anrufen"
              icon="call-outline"
              variant="secondary"
              disabled={!c.phone}
              onPress={() => c.phone && void openUrl(`tel:${c.phone.replace(/[^\d+]/g, '')}`, 'Auf diesem Gerät können keine Anrufe gestartet werden.')}
              style={styles.flex}
              accessibilityLabel={c.phone ? `${c.phone} anrufen` : 'Anrufen – keine Telefonnummer hinterlegt'}
            />
            <Button
              label="E-Mail"
              icon="mail-outline"
              variant="secondary"
              disabled={!c.email}
              onPress={() => c.email && void openUrl(`mailto:${c.email}`, 'Keine E-Mail-App gefunden.')}
              style={styles.flex}
              accessibilityLabel={c.email ? `E-Mail an ${c.email}` : 'E-Mail – keine Adresse hinterlegt'}
            />
          </View>
          {!c.phone || !c.email ? (
            <Text variant="small" tone="muted">
              {!c.phone && !c.email ? 'Keine Telefonnummer und keine E-Mail hinterlegt.' : !c.phone ? 'Keine Telefonnummer hinterlegt.' : 'Keine E-Mail-Adresse hinterlegt.'}
            </Text>
          ) : null}
        </Card>

        <Button
          label="Neues Angebot für diesen Kunden"
          icon="add"
          onPress={() => router.push({ pathname: '/quotation-editor', params: { customerId: c.id } })}
          disabled={c.isArchived || c.isAnonymized}
          testID="customer-new-quotation"
        />

        <SectionHeader title="Kontakt & Adresse" />
        <Card>
          {c.email ? <KeyValue label="E-Mail" value={c.email} /> : null}
          {c.phone ? <KeyValue label="Telefon" value={c.phone} /> : null}
          <KeyValue label="Rechnungsadresse" value={billing ?? '–'} />
          {service ? <KeyValue label="Leistungsadresse" value={service} /> : null}
          {c.vatId ? <KeyValue label="USt-IdNr." value={c.vatId} /> : null}
          {c.notes ? <KeyValue label="Notizen" value={c.notes} /> : null}
          <KeyValue label="Angelegt" value={formatDateTime(c.createdAt)} />
        </Card>

        <SectionHeader title={`Angebote${quotations.data ? ` (${quotations.data.length})` : ''}`} />
        {quotations.isPending ? <ListSkeleton rows={2} /> : null}
        {quotations.isError ? <ErrorState error={quotations.error} onRetry={() => void quotations.refetch()} compact /> : null}
        {quotations.data?.length === 0 ? <Text variant="caption" tone="muted">Noch keine Angebote für diesen Kunden.</Text> : null}
        <View style={styles.list}>
          {quotations.data?.map((q) => <QuotationCard key={q.id} item={q} />)}
        </View>

        <SectionHeader title={`Aufträge${jobs.data ? ` (${jobs.data.length})` : ''}`} />
        {jobs.isError ? <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} compact /> : null}
        {jobs.data?.length === 0 ? <Text variant="caption" tone="muted">Noch keine Aufträge.</Text> : null}
        <View style={styles.list}>
          {jobs.data?.map((j) => <JobCard key={j.id} item={j} />)}
        </View>
      </ContentScroll>

      <OptionSheet<MenuAction>
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Kundenaktionen"
        options={[
          { value: 'edit', label: 'Bearbeiten', icon: 'create-outline' },
          c.isArchived
            ? { value: 'unarchive', label: 'Wiederherstellen', icon: 'arrow-undo-outline' }
            : { value: 'archive', label: 'Archivieren', icon: 'archive-outline' },
          { value: 'delete', label: 'Löschen / anonymisieren', icon: 'trash-outline', destructive: true },
        ]}
        onSelect={(a) => setTimeout(() => onMenu(a), 250)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: space[2] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  contactRow: { flexDirection: 'row', gap: space[3], marginTop: space[2] },
  list: { gap: space[3] },
});
