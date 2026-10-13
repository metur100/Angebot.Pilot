import { jobStatusLabel, tr, type JobStatus } from '@angebotpilot/api-contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { JobCard } from '@/components/EntityCards';
import { FilterChips, Screen, SearchBar, ThemedRefreshControl } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { useLocale } from '@/lib/i18n';
import { flattenPages, useJobList } from '@/lib/queries';
import { makeStyles, space, useTheme } from '@/theme';

type Filter = 'active' | 'all' | JobStatus;

function filterOptions(): { value: Filter; label: string }[] {
  return [
    { value: 'active', label: tr('Offen & in Arbeit', 'Open & in progress') },
    ...(['Open', 'InProgress', 'Completed', 'Cancelled'] as const).map((value) => ({ value, label: jobStatusLabel[value] })),
    { value: 'all', label: tr('Alle', 'All') },
  ];
}

function statusesFor(filter: Filter): JobStatus[] | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'active') return ['Open', 'InProgress'];
  return [filter];
}

export default function JobsScreen() {
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const query = useJobList({ search: debounced || undefined, status: statusesFor(filter) });
  const items = flattenPages(query.data);
  const total = query.data?.pages[0]?.totalCount ?? 0;

  return (
    <Screen>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={tr('Auftrag oder Kunde suchen', 'Search job or customer')} testID="job-search" />
        <FilterChips options={filterOptions()} value={filter} onChange={setFilter} accessibilityLabel={tr('Nach Status filtern', 'Filter by status')} />
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
          refreshControl={<ThemedRefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <Text variant="caption" tone="muted" style={styles.count}>
                {total} {total === 1 ? tr('Auftrag', 'job') : tr('Aufträge', 'jobs')}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brandText} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title={debounced || filter !== 'active' ? tr('Keine Aufträge gefunden', 'No jobs found') : tr('Keine offenen Aufträge', 'No open jobs')}
              message={tr(
                'Aufträge entstehen aus angenommenen Angeboten: Öffnen Sie ein angenommenes Angebot und wählen Sie „In Auftrag umwandeln“.',
                'Jobs are created from accepted quotations: open an accepted quotation and choose “Convert to job”.',
              )}
              actionLabel={tr('Angenommene Angebote', 'Accepted quotations')}
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

const useStyles = makeStyles(({ colors }) => ({
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2], backgroundColor: colors.background },
  list: { padding: space[4], flexGrow: 1 },
  count: { marginBottom: space[2] },
  footer: { marginVertical: space[4] },
}));
