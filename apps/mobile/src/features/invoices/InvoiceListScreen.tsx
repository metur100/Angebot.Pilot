import type { InvoiceStatus } from '@angebotpilot/api-contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { InvoiceCard } from '@/components/EntityCards';
import { Fab } from '@/components/Fab';
import { FilterChips, Screen, SearchBar } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { flattenPages, useInvoiceList } from '@/lib/queries';
import { colors, space } from '@/theme';

export type InvoiceFilter = 'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled';

const FILTERS: { value: InvoiceFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'draft', label: 'Entwürfe' },
  { value: 'open', label: 'Offen' },
  { value: 'overdue', label: 'Überfällig' },
  { value: 'paid', label: 'Bezahlt' },
  { value: 'cancelled', label: 'Storniert' },
];

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
  return value && FILTERS.some((f) => f.value === value) ? (value as InvoiceFilter) : null;
}

const emptyTitle: Record<InvoiceFilter, string> = {
  all: 'Noch keine Rechnungen',
  draft: 'Keine Entwürfe',
  open: 'Keine offenen Rechnungen',
  overdue: 'Keine überfälligen Rechnungen',
  paid: 'Keine bezahlten Rechnungen',
  cancelled: 'Keine stornierten Rechnungen',
};

export default function InvoiceListScreen() {
  const router = useRouter();
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
        <SearchBar value={search} onChangeText={setSearch} placeholder="Nummer, Betreff oder Kunde suchen" testID="invoice-search" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} accessibilityLabel="Rechnungen nach Status filtern" />
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
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} colors={[colors.brand]} tintColor={colors.brand} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <Text variant="caption" tone="muted" style={styles.count}>
                {total} {total === 1 ? 'Rechnung' : 'Rechnungen'}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brand} /> : <View style={styles.fabSpace} />}
          ListEmptyComponent={
            debounced ? (
              <EmptyState icon="search-outline" title="Keine Treffer" message="Passen Sie Suche oder Filter an." testID="invoices-empty" />
            ) : (
              <EmptyState
                icon="receipt-outline"
                title={emptyTitle[filter]}
                message="Rechnungen erstellen Sie aus einem angenommenen Angebot, aus einem Auftrag („Rechnung erstellen“) oder direkt über „Neue Rechnung“. Entwürfe erhalten ihre Rechnungsnummer erst beim Stellen."
                actionLabel={filter === 'all' ? 'Neue Rechnung' : undefined}
                onAction={filter === 'all' ? () => router.push('/invoice-editor') : undefined}
                testID="invoices-empty"
              />
            )
          }
          testID="invoice-list"
        />
      )}
      <Fab label="Neue Rechnung" icon="add" onPress={() => router.push('/invoice-editor')} testID="fab-new-invoice" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2], backgroundColor: colors.background },
  list: { padding: space[4], flexGrow: 1 },
  count: { marginBottom: space[2] },
  footer: { marginVertical: space[4] },
  fabSpace: { height: 88 },
});
