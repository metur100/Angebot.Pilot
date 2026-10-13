// Searchable customer picker with quick-create, shown as a tall bottom sheet in the quotation editor.
import { customerSchema, type CustomerDto, type CustomerListItemDto, type CustomerType } from '@angebotpilot/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { CustomerCard } from '@/components/EntityCards';
import { SegmentedControl, TextField } from '@/components/Field';
import { SearchBar } from '@/components/Layout';
import { Sheet } from '@/components/Sheet';
import { EmptyState, ErrorState, InlineError } from '@/components/States';
import { emptyToNull } from '@/lib/forms';
import { useDebouncedValue } from '@/lib/hooks';
import { useLocale } from '@/lib/i18n';
import { flattenPages, keys, useCustomerList } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { errorMessage } from '@angebotpilot/api-contracts';
import { space, useTheme } from '@/theme';

export interface PickedCustomer {
  id: string;
  displayName: string;
}

function QuickCreate({ onCreated, onCancel, initialName }: { onCreated: (c: CustomerDto) => void; onCancel: () => void; initialName: string }) {
  const companyId = useCompanyId();
  const { tr } = useLocale();
  const queryClient = useQueryClient();
  const [type, setType] = useState<CustomerType>('Business');
  const [companyName, setCompanyName] = useState(initialName);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState(type === 'Private' ? initialName : '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = customerSchema.safeParse({ type, companyName, firstName, lastName, email, phone, billingCountry: 'DE' });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    setFormError(null);
    try {
      const created = await api.customers.create(companyId, {
        type,
        companyName: type === 'Business' ? emptyToNull(companyName) : null,
        firstName: emptyToNull(firstName),
        lastName: emptyToNull(lastName),
        email: emptyToNull(email),
        phone: emptyToNull(phone),
        billingCountry: 'DE',
        hasServiceAddress: false,
        followUpOptOut: false,
      });
      void queryClient.invalidateQueries({ queryKey: keys.customers(companyId) });
      onCreated(created);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.quick} testID="quick-create-customer">
      <SegmentedControl
        accessibilityLabel={tr('Kundenart', 'Customer type')}
        options={[
          { value: 'Business', label: tr('Geschäftskunde', 'Business customer') },
          { value: 'Private', label: tr('Privatkunde', 'Private customer') },
        ]}
        value={type}
        onChange={setType}
      />
      {type === 'Business' ? (
        <TextField label={tr('Firmenname', 'Company name')} value={companyName} onChangeText={setCompanyName} error={errors.companyName} required testID="quick-companyName" />
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label={tr('Vorname', 'First name')} value={firstName} onChangeText={setFirstName} error={errors.firstName} />
        </View>
        <View style={styles.flex}>
          <TextField label={tr('Nachname', 'Last name')} value={lastName} onChangeText={setLastName} error={errors.lastName} required={type === 'Private'} testID="quick-lastName" />
        </View>
      </View>
      <TextField label={tr('E-Mail', 'Email')} value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
      <TextField label={tr('Telefon', 'Phone')} value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="phone-pad" />
      <InlineError message={formError} />
      <View style={styles.row}>
        <Button label={tr('Zurück', 'Back')} variant="outline" onPress={onCancel} style={styles.flex} />
        <Button label={tr('Anlegen & wählen', 'Create & select')} onPress={() => void save()} loading={saving} style={styles.flex} testID="quick-save" />
      </View>
    </View>
  );
}

export function CustomerPicker({
  visible, onClose, onPick,
}: { visible: boolean; onClose: () => void; onPick: (customer: PickedCustomer) => void }) {
  const { tr } = useLocale();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search.trim());
  const query = useCustomerList({ search: debounced || undefined, status: 'active', sort: 'name' });
  const items = flattenPages(query.data);

  const pick = (c: CustomerListItemDto | CustomerDto) => {
    onPick({ id: c.id, displayName: c.displayName });
    setCreating(false);
    setSearch('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={creating ? tr('Neuen Kunden anlegen', 'Create new customer') : tr('Kunde wählen', 'Choose customer')} tall scroll={creating} testID="customer-picker">
      {creating ? (
        <QuickCreate onCreated={pick} onCancel={() => setCreating(false)} initialName={search} />
      ) : (
        <View style={styles.flex}>
          <SearchBar value={search} onChangeText={setSearch} placeholder={tr('Kunden suchen', 'Search customers')} testID="picker-search" />
          <Button label={tr('Neuen Kunden anlegen', 'Create new customer')} icon="person-add-outline" variant="secondary" onPress={() => setCreating(true)} style={styles.newButton} testID="picker-new" />
          {query.isPending ? (
            <ActivityIndicator color={colors.brandText} style={styles.loading} />
          ) : query.isError && items.length === 0 ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => <CustomerCard item={item} onPress={() => pick(item)} />}
              ItemSeparatorComponent={() => <View style={{ height: space[2] }} />}
              onEndReached={() => {
                if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
              }}
              ListEmptyComponent={
                <EmptyState icon="people-outline" title={tr('Keine Kunden gefunden', 'No customers found')} message={tr('Legen Sie einen neuen Kunden an.', 'Create a new customer.')} />
              }
              contentContainerStyle={styles.list}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space[3] },
  quick: { gap: space[3] },
  newButton: { marginTop: space[3], marginBottom: space[2] },
  loading: { marginTop: space[6] },
  list: { paddingVertical: space[2], flexGrow: 1 },
});
