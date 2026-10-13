import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { CustomerCard } from '@/components/EntityCards';
import { Fab } from '@/components/Fab';
import { FilterChips, Screen, SearchBar } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { flattenPages, useCustomerList } from '@/lib/queries';
import { colors, space } from '@/theme';

type StatusFilter = 'active' | 'archived' | 'all';
type TypeFilter = 'any' | 'Business' | 'Private';

export default function CustomersScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>('active');
  const [type, setType] = useState<TypeFilter>('any');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim());
  const query = useCustomerList({ search: debounced || undefined, status, type: type === 'any' ? undefined : type, sort: 'name' });
  const items = flattenPages(query.data);
  const total = query.data?.pages[0]?.totalCount ?? 0;
  const filtered = !!debounced || status !== 'active' || type !== 'any';

  return (
    <Screen>
      <View style={styles.header}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Name, Ort oder E-Mail suchen" testID="customer-search" />
        <FilterChips
          options={[
            { value: 'active', label: 'Aktiv' },
            { value: 'archived', label: 'Archiviert' },
            { value: 'all', label: 'Alle' },
          ]}
          value={status}
          onChange={setStatus}
          accessibilityLabel="Nach Status filtern"
        />
        <FilterChips
          options={[
            { value: 'any', label: 'Alle Arten' },
            { value: 'Business', label: 'Geschäftskunden' },
            { value: 'Private', label: 'Privatkunden' },
          ]}
          value={type}
          onChange={setType}
          accessibilityLabel="Nach Kundenart filtern"
        />
      </View>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError && items.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <CustomerCard item={item} />}
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
                {total} {total === 1 ? 'Kunde' : 'Kunden'}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brand} /> : <View style={styles.fabSpace} />}
          ListEmptyComponent={
            filtered ? (
              <EmptyState icon="search-outline" title="Keine Kunden gefunden" message="Passen Sie Suche oder Filter an." testID="customers-empty" />
            ) : (
              <EmptyState
                icon="people-outline"
                title="Noch keine Kunden"
                message="Legen Sie Ihren ersten Kunden an, um ein Angebot zu erstellen."
                actionLabel="Kunde anlegen"
                onAction={() => router.push('/customer-form')}
                testID="customers-empty"
              />
            )
          }
          testID="customer-list"
        />
      )}
      <Fab label="Neuer Kunde" icon="person-add-outline" onPress={() => router.push('/customer-form')} testID="fab-new-customer" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[1], backgroundColor: colors.background },
  list: { padding: space[4], flexGrow: 1 },
  count: { marginBottom: space[2] },
  footer: { marginVertical: space[4] },
  fabSpace: { height: 88 },
});
