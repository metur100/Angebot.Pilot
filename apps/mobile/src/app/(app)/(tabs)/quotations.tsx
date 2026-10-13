import { quotationStatusLabel, tr, type QuotationStatus } from '@angebotpilot/api-contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { QuotationCard } from '@/components/EntityCards';
import { Fab } from '@/components/Fab';
import { FilterChips, Screen, SearchBar, ThemedRefreshControl } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { useLocale } from '@/lib/i18n';
import { flattenPages, useQuotationList } from '@/lib/queries';
import { makeStyles, space, useTheme } from '@/theme';

type Filter = 'all' | QuotationStatus;

const FILTER_VALUES: Filter[] = ['all', 'Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled'];

function filterOptions(): { value: Filter; label: string }[] {
  return FILTER_VALUES.map((value) => ({
    value,
    label: value === 'all' ? tr('Alle', 'All') : value === 'Draft' ? tr('Entwürfe', 'Drafts') : quotationStatusLabel[value],
  }));
}

function toFilter(value: string | undefined): Filter | null {
  return value && FILTER_VALUES.includes(value as Filter) ? (value as Filter) : null;
}

export default function QuotationsScreen() {
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
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
        <SearchBar value={search} onChangeText={setSearch} placeholder={tr('Nummer, Betreff oder Kunde suchen', 'Search number, subject or customer')} testID="quotation-search" />
        <FilterChips options={filterOptions()} value={filter} onChange={setFilter} accessibilityLabel={tr('Nach Status filtern', 'Filter by status')} />
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
          refreshControl={<ThemedRefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <Text variant="caption" tone="muted" style={styles.count}>
                {total} {total === 1 ? tr('Angebot', 'quotation') : tr('Angebote', 'quotations')}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brandText} /> : <View style={styles.fabSpace} />}
          ListEmptyComponent={
            filtered ? (
              <EmptyState
                icon="search-outline"
                title={tr('Keine Treffer', 'No results')}
                message={tr('Passen Sie Suche oder Filter an.', 'Adjust your search or filters.')}
                testID="quotations-empty"
              />
            ) : (
              <EmptyState
                icon="document-text-outline"
                title={tr('Noch keine Angebote', 'No quotations yet')}
                message={tr(
                  'Erstellen Sie Ihr erstes Angebot – Positionen erfassen, Summen werden automatisch berechnet.',
                  'Create your first quotation – enter line items, totals are calculated automatically.',
                )}
                actionLabel={tr('Angebot erstellen', 'Create quotation')}
                onAction={() => router.push('/quotation-editor')}
                testID="quotations-empty"
              />
            )
          }
          testID="quotation-list"
        />
      )}
      <Fab label={tr('Neues Angebot', 'New quotation')} icon="add" onPress={() => router.push('/quotation-editor')} testID="fab-new-quotation" />
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
