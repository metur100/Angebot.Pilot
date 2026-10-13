import type { JobStatus } from '@angebotpilot/api-contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { JobCard } from '@/components/EntityCards';
import { FilterChips, Screen, SearchBar } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { flattenPages, useJobList } from '@/lib/queries';
import { colors, space } from '@/theme';

type Filter = 'active' | 'all' | JobStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Offen & in Arbeit' },
  { value: 'Open', label: 'Offen' },
  { value: 'InProgress', label: 'In Arbeit' },
  { value: 'Completed', label: 'Abgeschlossen' },
  { value: 'Cancelled', label: 'Storniert' },
  { value: 'all', label: 'Alle' },
];

function statusesFor(filter: Filter): JobStatus[] | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'active') return ['Open', 'InProgress'];
  return [filter];
}

export default function JobsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const query = useJobList({ search: debounced || undefined, status: statusesFor(filter) });
  const items = flattenPages(query.data);
  const total = query.data?.pages[0]?.totalCount ?? 0;

  return (
    <Screen>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Auftrag oder Kunde suchen" testID="job-search" />
        <FilterChips options={FILTERS} value={filter} onChange={setFilter} accessibilityLabel="Nach Status filtern" />
      </View>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(j) => j.id}
          renderItem={({ item }) => <JobCard item={item} />}
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
                {total} {total === 1 ? 'Auftrag' : 'Aufträge'}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brand} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title={debounced || filter !== 'active' ? 'Keine Aufträge gefunden' : 'Keine offenen Aufträge'}
              message="Aufträge entstehen aus angenommenen Angeboten: Öffnen Sie ein angenommenes Angebot und wählen Sie „In Auftrag umwandeln“."
              actionLabel="Angenommene Angebote"
              onAction={() => router.push({ pathname: '/quotations', params: { status: 'Accepted' } })}
              testID="jobs-empty"
            />
          }
          testID="job-list"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2], backgroundColor: colors.background },
  list: { padding: space[4], flexGrow: 1 },
  count: { marginBottom: space[2] },
  footer: { marginVertical: space[4] },
});
