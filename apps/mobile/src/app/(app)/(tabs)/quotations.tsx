import type { QuotationStatus } from '@angebotpilot/api-contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { QuotationCard } from '@/components/EntityCards';
import { Fab } from '@/components/Fab';
import { FilterChips, Screen, SearchBar } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { flattenPages, useQuotationList } from '@/lib/queries';
import { colors, space } from '@/theme';

type Filter = 'all' | QuotationStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'Draft', label: 'Entwürfe' },
  { value: 'Sent', label: 'Versendet' },
  { value: 'Accepted', label: 'Angenommen' },
  { value: 'Rejected', label: 'Abgelehnt' },
  { value: 'Expired', label: 'Abgelaufen' },
  { value: 'Cancelled', label: 'Storniert' },
];

function toFilter(value: string | undefined): Filter | null {
  return value && FILTERS.some((f) => f.value === value) ? (value as Filter) : null;
}

export default function QuotationsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const [filter, setFilter] = useState<Filter>(() => toFilter(params.status) ?? 'all');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());

  // Dashboard KPIs navigate here with ?status=…; adopt a changed param (React's "adjust state on prop change" pattern).
  const [seenStatusParam, setSeenStatusParam] = useState(params.status);
  if (params.status !== seenStatusParam) {
    setSeenStatusParam(params.status);
    const next = toFilter(params.status);
    if (next) setFilter(next);
  }

  const query = useQuotationList({ search: debounced || undefined, status: filter === 'all' ? undefined : [filter] });
  const items = flattenPages(query.data);
  const total = query.data?.pages[0]?.totalCount ?? 0;
  const filtered = filter !== 'all' || !!debounced;

  return (
    <Screen>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Nummer, Betreff oder Kunde suchen" testID="quotation-search" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} accessibilityLabel="Nach Status filtern" />
      </View>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(q) => q.id}
          renderItem={({ item }) => <QuotationCard item={item} />}
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
                {total} {total === 1 ? 'Angebot' : 'Angebote'}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brand} /> : <View style={styles.fabSpace} />}
          ListEmptyComponent={
            filtered ? (
              <EmptyState icon="search-outline" title="Keine Treffer" message="Passen Sie Suche oder Filter an." testID="quotations-empty" />
            ) : (
              <EmptyState
                icon="document-text-outline"
                title="Noch keine Angebote"
                message="Erstellen Sie Ihr erstes Angebot – Positionen erfassen, Summen werden automatisch berechnet."
                actionLabel="Angebot erstellen"
                onAction={() => router.push('/quotation-editor')}
                testID="quotations-empty"
              />
            )
          }
          testID="quotation-list"
        />
      )}
      <Fab label="Neues Angebot" icon="add" onPress={() => router.push('/quotation-editor')} testID="fab-new-quotation" />
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
