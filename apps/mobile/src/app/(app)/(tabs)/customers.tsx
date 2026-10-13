import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { CustomerCard } from '@/components/EntityCards';
import { Fab } from '@/components/Fab';
import { FilterChips, Screen, SearchBar, ThemedRefreshControl } from '@/components/Layout';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useDebouncedValue } from '@/lib/hooks';
import { useLocale } from '@/lib/i18n';
import { flattenPages, useCustomerList } from '@/lib/queries';
import { makeStyles, space, useTheme } from '@/theme';

type StatusFilter = 'active' | 'archived' | 'all';
type TypeFilter = 'any' | 'Business' | 'Private';

export default function CustomersScreen() {
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const styles = useStyles();
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
        <SearchBar value={search} onChangeText={setSearch} placeholder={tr('Name, Ort oder E-Mail suchen', 'Search name, city or email')} testID="customer-search" />
        <FilterChips
          options={[
            { value: 'active', label: tr('Aktiv', 'Active') },
            { value: 'archived', label: tr('Archiviert', 'Archived') },
            { value: 'all', label: tr('Alle', 'All') },
          ]}
          value={status}
          onChange={setStatus}
          accessibilityLabel={tr('Nach Status filtern', 'Filter by status')}
        />
        <FilterChips
          options={[
            { value: 'any', label: tr('Alle Arten', 'All types') },
            { value: 'Business', label: tr('Geschäftskunden', 'Business customers') },
            { value: 'Private', label: tr('Privatkunden', 'Private customers') },
          ]}
          value={type}
          onChange={setType}
          accessibilityLabel={tr('Nach Kundenart filtern', 'Filter by customer type')}
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
          refreshControl={<ThemedRefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <Text variant="caption" tone="muted" style={styles.count}>
                {total} {total === 1 ? tr('Kunde', 'customer') : tr('Kunden', 'customers')}
              </Text>
            ) : null
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.brandText} /> : <View style={styles.fabSpace} />}
          ListEmptyComponent={
            filtered ? (
              <EmptyState
                icon="search-outline"
                title={tr('Keine Kunden gefunden', 'No customers found')}
                message={tr('Passen Sie Suche oder Filter an.', 'Adjust your search or filters.')}
                testID="customers-empty"
              />
            ) : (
              <EmptyState
                icon="people-outline"
                title={tr('Noch keine Kunden', 'No customers yet')}
                message={tr('Legen Sie Ihren ersten Kunden an, um ein Angebot zu erstellen.', 'Add your first customer to create a quotation.')}
                actionLabel={tr('Kunde anlegen', 'Add customer')}
                onAction={() => router.push('/customer-form')}
                testID="customers-empty"
              />
            )
          }
          testID="customer-list"
        />
      )}
      <Fab label={tr('Neuer Kunde', 'New customer')} icon="person-add-outline" onPress={() => router.push('/customer-form')} testID="fab-new-customer" />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[1], backgroundColor: colors.background },
  list: { padding: space[4], flexGrow: 1 },
  count: { marginBottom: space[2] },
  footer: { marginVertical: space[4] },
  fabSpace: { height: 88 },
}));
