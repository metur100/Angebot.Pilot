import { tr, type InvoiceStatus } from '@angebotpilot/api-contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { InvoiceCard } from '@/components/EntityCards';
import { Fab } from '@/components/Fab';
import { FilterChips, Screen, SearchBar, ThemedRefreshControl } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { useLocale } from '@/lib/i18n';
import { flattenPages, useInvoiceList } from '@/lib/queries';
import { makeStyles, space, useTheme } from '@/theme';

export type InvoiceFilter = 'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled';

const FILTER_VALUES: InvoiceFilter[] = ['all', 'draft', 'open', 'overdue', 'paid', 'cancelled'];

function filterLabel(filter: InvoiceFilter): string {
  switch (filter) {
    case 'all':
      return tr('Alle', 'All');
    case 'draft':
      return tr('Entwürfe', 'Drafts');
    case 'open':
      return tr('Offen', 'Open');
    case 'overdue':
      return tr('Überfällig', 'Overdue');
    case 'paid':
      return tr('Bezahlt', 'Paid');
    case 'cancelled':
      return tr('Storniert', 'Cancelled');
  }
}

/** Maps a filter chip to the list query (overdue is derived on the server, not a status). */
export function invoiceQueryFor(filter: InvoiceFilter): { status?: InvoiceStatus[]; overdue?: boolean } {
  switch (filter) {
    case 'draft':
      return { status: ['Draft'] };
    case 'open':
      return { status: ['Issued', 'PartiallyPaid'] };
    case 'overdue':
      return { overdue: true };
    case 'paid':
      return { status: ['Paid'] };
    case 'cancelled':
      return { status: ['Cancelled'] };
    default:
      return {};
  }
}

function toFilter(value: string | undefined): InvoiceFilter | null {
  return value && FILTER_VALUES.includes(value as InvoiceFilter) ? (value as InvoiceFilter) : null;
}

function emptyTitle(filter: InvoiceFilter): string {
  switch (filter) {
    case 'all':
      return tr('Noch keine Rechnungen', 'No invoices yet');
    case 'draft':
      return tr('Keine Entwürfe', 'No drafts');
    case 'open':
      return tr('Keine offenen Rechnungen', 'No open invoices');
    case 'overdue':
      return tr('Keine überfälligen Rechnungen', 'No overdue invoices');
    case 'paid':
      return tr('Keine bezahlten Rechnungen', 'No paid invoices');
    case 'cancelled':
      return tr('Keine stornierten Rechnungen', 'No cancelled invoices');
  }
}

export default function InvoiceListScreen() {
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<InvoiceFilter>(() => toFilter(params.filter) ?? 'all');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());

  // Dashboard KPIs navigate here with ?filter=…; adopt a changed param (React's "adjust state on prop change" pattern).
  const [seenFilterParam, setSeenFilterParam] = useState(params.filter);
  if (params.filter !== seenFilterParam) {
    setSeenFilterParam(params.filter);
    const next = toFilter(params.filter);
    if (next) setFilter(next);
  }

  const query = useInvoiceList({ search: debounced || undefined, ...invoiceQueryFor(filter) });
  const items = flattenPages(query.data);
  const total = query.data?.pages[0]?.totalCount ?? 0;

  return (
    <Screen>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={tr('Nummer, Betreff oder Kunde suchen', 'Search number, subject or customer')} testID="invoice-search" />
        <FilterChips
          options={FILTER_VALUES.map((value) => ({ value, label: filterLabel(value) }))}
          value={filter}
          onChange={setFilter}
          accessibilityLabel={tr('Rechnungen nach Status filtern', 'Filter invoices by status')}
        />
      </View>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <InvoiceCard item={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space[3] }} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          refreshControl={<ThemedRefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <Text variant="caption" tone="muted" style={styles.count}>
                {total} {total === 1 ? tr('Rechnung', 'invoice') : tr('Rechnungen', 'invoices')}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brandText} /> : <View style={styles.fabSpace} />}
          ListEmptyComponent={
            debounced ? (
              <EmptyState
                icon="search-outline"
                title={tr('Keine Treffer', 'No results')}
                message={tr('Passen Sie Suche oder Filter an.', 'Adjust your search or filters.')}
                testID="invoices-empty"
              />
            ) : (
              <EmptyState
                icon="receipt-outline"
                title={emptyTitle(filter)}
                message={tr(
                  'Rechnungen erstellen Sie aus einem angenommenen Angebot, aus einem Auftrag („Rechnung erstellen“) oder direkt über „Neue Rechnung“. Entwürfe erhalten ihre Rechnungsnummer erst beim Stellen.',
                  'Create invoices from an accepted quotation, from a job (“Create invoice”) or directly via “New invoice”. Drafts get their invoice number only when issued.',
                )}
                actionLabel={filter === 'all' ? tr('Neue Rechnung', 'New invoice') : undefined}
                onAction={filter === 'all' ? () => router.push('/invoice-editor') : undefined}
                testID="invoices-empty"
              />
            )
          }
          testID="invoice-list"
        />
      )}
      <Fab label={tr('Neue Rechnung', 'New invoice')} icon="add" onPress={() => router.push('/invoice-editor')} testID="fab-new-invoice" />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2], backgroundColor: colors.background },
  list: { padding: space[4], flexGrow: 1 },
  count: { marginBottom: space[2] },
  footer: { marginVertical: space[4] },
  fabSpace: { height: 88 },
}));
