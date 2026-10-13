import { customerTypeLabel, errorMessage, formatDateTime, tr, type CustomerDto } from '@angebotpilot/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card, KeyValue, SectionHeader } from '@/components/Card';
import { InvoiceCard, JobCard, QuotationCard } from '@/components/EntityCards';
import { ContentScroll, Screen } from '@/components/Layout';
import { OptionSheet } from '@/components/Sheet';
import { Badge } from '@/components/StatusBadge';
import { ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useLocale } from '@/lib/i18n';
import { keys, useCustomer, useCustomerInvoices, useCustomerJobs, useCustomerQuotations } from '@/lib/queries';
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
    Alert.alert(tr('Nicht möglich', 'Not possible'), failMessage);
  }
}

type MenuAction = 'edit' | 'archive' | 'unarchive' | 'delete';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = useCompanyId();
  const { tr } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const customer = useCustomer(id);
  const quotations = useCustomerQuotations(id);
  const jobs = useCustomerJobs(id);
  const invoices = useCustomerInvoices(id);
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
      Alert.alert(tr('Aktion fehlgeschlagen', 'Action failed'), errorMessage(error));
    }
  };

  const onMenu = (action: MenuAction) => {
    if (!c) return;
    if (action === 'edit') router.push({ pathname: '/customer-form', params: { id: c.id } });
    if (action === 'archive') void run(async () => { update(await api.customers.archive(companyId, c.id)); toast(tr('Kunde archiviert', 'Customer archived')); });
    if (action === 'unarchive') void run(async () => { update(await api.customers.unarchive(companyId, c.id)); toast(tr('Kunde wiederhergestellt', 'Customer restored')); });
    if (action === 'delete') {
      Alert.alert(
        tr('Kunde löschen?', 'Delete customer?'),
        tr(
          'Kunden ohne Angebote und Aufträge werden endgültig gelöscht. Bei vorhandenen Belegen werden die personenbezogenen Daten anonymisiert (Aufbewahrungspflichten).',
          'Customers without quotations and jobs are deleted permanently. If documents exist, the personal data is anonymised instead (retention obligations).',
        ),
        [
          { text: tr('Abbrechen', 'Cancel'), style: 'cancel' },
          {
            text: tr('Löschen', 'Delete'),
            style: 'destructive',
            onPress: () =>
              void run(async () => {
                const res = await api.customers.delete(companyId, c.id);
                void queryClient.invalidateQueries({ queryKey: keys.customers(companyId) });
                queryClient.removeQueries({ queryKey: keys.customer(companyId, c.id) });
                toast(res.result === 'deleted' ? tr('Kunde gelöscht', 'Customer deleted') : tr('Kundendaten anonymisiert', 'Customer data anonymised'));
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
          headerRight: () => <IconButton icon="ellipsis-horizontal-circle-outline" accessibilityLabel={tr('Kundenaktionen', 'Customer actions')} onPress={() => setMenuOpen(true)} testID="customer-menu" />,
        }}
      />
      <ContentScroll
        refreshing={customer.isRefetching}
        onRefresh={() => {
          void customer.refetch();
          void quotations.refetch();
          void jobs.refetch();
          void invoices.refetch();
        }}
        testID="customer-detail"
      >
        <Card style={styles.gap}>
          <View style={styles.badges}>
            <Badge label={customerTypeLabel[c.type]} tone="info" icon={c.type === 'Business' ? 'business-outline' : 'person-outline'} />
            {c.isArchived ? <Badge label={tr('Archiviert', 'Archived')} tone="muted" icon="archive-outline" /> : null}
            {c.followUpOptOut ? <Badge label={tr('Keine Erinnerungen', 'No reminders')} tone="warning" icon="notifications-off-outline" /> : null}
          </View>
          <Text variant="title" accessibilityRole="header">
            {c.displayName}
          </Text>
          {contact && c.type === 'Business' ? <Text variant="body" tone="secondary">{contact}</Text> : null}
          <View style={styles.contactRow}>
            <Button
              label={tr('Anrufen', 'Call')}
              icon="call-outline"
              variant="secondary"
              disabled={!c.phone}
              onPress={() =>
                c.phone && void openUrl(`tel:${c.phone.replace(/[^\d+]/g, '')}`, tr('Auf diesem Gerät können keine Anrufe gestartet werden.', 'This device cannot make calls.'))
              }
              style={styles.flex}
              accessibilityLabel={c.phone ? tr(`${c.phone} anrufen`, `Call ${c.phone}`) : tr('Anrufen – keine Telefonnummer hinterlegt', 'Call – no phone number on file')}
            />
            <Button
              label={tr('E-Mail', 'Email')}
              icon="mail-outline"
              variant="secondary"
              disabled={!c.email}
              onPress={() => c.email && void openUrl(`mailto:${c.email}`, tr('Keine E-Mail-App gefunden.', 'No email app found.'))}
              style={styles.flex}
              accessibilityLabel={c.email ? tr(`E-Mail an ${c.email}`, `Email ${c.email}`) : tr('E-Mail – keine Adresse hinterlegt', 'Email – no address on file')}
            />
          </View>
          {!c.phone || !c.email ? (
            <Text variant="small" tone="muted">
              {!c.phone && !c.email
                ? tr('Keine Telefonnummer und keine E-Mail hinterlegt.', 'No phone number and no email on file.')
                : !c.phone ? tr('Keine Telefonnummer hinterlegt.', 'No phone number on file.') : tr('Keine E-Mail-Adresse hinterlegt.', 'No email address on file.')}
            </Text>
          ) : null}
        </Card>

        <Button
          label={tr('Neues Angebot für diesen Kunden', 'New quotation for this customer')}
          icon="add"
          onPress={() => router.push({ pathname: '/quotation-editor', params: { customerId: c.id } })}
          disabled={c.isArchived || c.isAnonymized}
          testID="customer-new-quotation"
        />

        <SectionHeader title={tr('Kontakt & Adresse', 'Contact & address')} />
        <Card>
          {c.email ? <KeyValue label={tr('E-Mail', 'Email')} value={c.email} /> : null}
          {c.phone ? <KeyValue label={tr('Telefon', 'Phone')} value={c.phone} /> : null}
          <KeyValue label={tr('Rechnungsadresse', 'Billing address')} value={billing ?? '–'} />
          {service ? <KeyValue label={tr('Leistungsadresse', 'Service address')} value={service} /> : null}
          {c.vatId ? <KeyValue label={tr('USt-IdNr.', 'VAT ID')} value={c.vatId} /> : null}
          {c.notes ? <KeyValue label={tr('Notizen', 'Notes')} value={c.notes} /> : null}
          <KeyValue label={tr('Angelegt', 'Created')} value={formatDateTime(c.createdAt)} />
        </Card>

        <SectionHeader title={`${tr('Angebote', 'Quotations')}${quotations.data ? ` (${quotations.data.length})` : ''}`} />
        {quotations.isPending ? <ListSkeleton rows={2} /> : null}
        {quotations.isError ? <ErrorState error={quotations.error} onRetry={() => void quotations.refetch()} compact /> : null}
        {quotations.data?.length === 0 ? <Text variant="caption" tone="muted">{tr('Noch keine Angebote für diesen Kunden.', 'No quotations for this customer yet.')}</Text> : null}
        <View style={styles.list}>
          {quotations.data?.map((q) => <QuotationCard key={q.id} item={q} />)}
        </View>

        <SectionHeader title={`${tr('Aufträge', 'Jobs')}${jobs.data ? ` (${jobs.data.length})` : ''}`} />
        {jobs.isError ? <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} compact /> : null}
        {jobs.data?.length === 0 ? <Text variant="caption" tone="muted">{tr('Noch keine Aufträge.', 'No jobs yet.')}</Text> : null}
        <View style={styles.list}>
          {jobs.data?.map((j) => <JobCard key={j.id} item={j} />)}
        </View>

        <SectionHeader
          title={`${tr('Rechnungen', 'Invoices')}${invoices.data ? ` (${invoices.data.length})` : ''}`}
          action={
            !c.isArchived && !c.isAnonymized ? (
              <Button
                label={tr('Neue Rechnung', 'New invoice')}
                icon="add"
                variant="ghost"
                size="sm"
                fullWidth={false}
                onPress={() => router.push({ pathname: '/invoice-editor', params: { customerId: c.id } })}
                accessibilityLabel={tr('Neue Rechnung für diesen Kunden', 'New invoice for this customer')}
                testID="customer-new-invoice"
              />
            ) : null
          }
        />
        {invoices.isError ? <ErrorState error={invoices.error} onRetry={() => void invoices.refetch()} compact /> : null}
        {invoices.data?.length === 0 ? <Text variant="caption" tone="muted">{tr('Noch keine Rechnungen.', 'No invoices yet.')}</Text> : null}
        <View style={styles.list} testID="customer-invoices">
          {invoices.data?.map((i) => <InvoiceCard key={i.id} item={i} />)}
        </View>
      </ContentScroll>

      <OptionSheet<MenuAction>
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={tr('Kundenaktionen', 'Customer actions')}
        options={[
          { value: 'edit', label: tr('Bearbeiten', 'Edit'), icon: 'create-outline' },
          c.isArchived
            ? { value: 'unarchive', label: tr('Wiederherstellen', 'Restore'), icon: 'arrow-undo-outline' }
            : { value: 'archive', label: tr('Archivieren', 'Archive'), icon: 'archive-outline' },
          { value: 'delete', label: tr('Löschen / anonymisieren', 'Delete / anonymise'), icon: 'trash-outline', destructive: true },
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
