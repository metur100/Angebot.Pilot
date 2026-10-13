import { customerSchema, type CustomerDto, type CustomerForm, type UpsertCustomerRequest } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, SectionHeader } from '@/components/Card';
import { SegmentedControl, SwitchRow, TextField, type TextFieldProps } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { ErrorState, InlineError, LoadingView } from '@/components/States';
import { useToast } from '@/components/Toast';
import { applyServerErrors, emptyToNull, isConflict } from '@/lib/forms';
import { keys, useCustomer } from '@/lib/queries';
import { api, useCompanyId } from '@/lib/session';
import { space } from '@/theme';

type TextKey = Exclude<keyof CustomerForm, 'type' | 'hasServiceAddress' | 'followUpOptOut'>;

const FIELDS: (keyof CustomerForm)[] = [
  'type', 'companyName', 'salutation', 'firstName', 'lastName', 'email', 'phone', 'billingStreet', 'billingPostalCode',
  'billingCity', 'billingCountry', 'hasServiceAddress', 'serviceStreet', 'servicePostalCode', 'serviceCity', 'serviceCountry',
  'vatId', 'notes', 'followUpOptOut',
];

export const emptyCustomer: CustomerForm = {
  type: 'Business', companyName: '', salutation: '', firstName: '', lastName: '', email: '', phone: '', billingStreet: '',
  billingPostalCode: '', billingCity: '', billingCountry: 'DE', hasServiceAddress: false, serviceStreet: '',
  servicePostalCode: '', serviceCity: '', serviceCountry: '', vatId: '', notes: '', followUpOptOut: false,
};

function fromDto(c: CustomerDto): CustomerForm {
  return {
    type: c.type, companyName: c.companyName ?? '', salutation: c.salutation ?? '', firstName: c.firstName ?? '',
    lastName: c.lastName ?? '', email: c.email ?? '', phone: c.phone ?? '', billingStreet: c.billingStreet ?? '',
    billingPostalCode: c.billingPostalCode ?? '', billingCity: c.billingCity ?? '', billingCountry: c.billingCountry || 'DE',
    hasServiceAddress: c.hasServiceAddress, serviceStreet: c.serviceStreet ?? '', servicePostalCode: c.servicePostalCode ?? '',
    serviceCity: c.serviceCity ?? '', serviceCountry: c.serviceCountry ?? '', vatId: c.vatId ?? '', notes: c.notes ?? '',
    followUpOptOut: c.followUpOptOut,
  };
}

export function toRequest(v: CustomerForm, rowVersion: string | null): UpsertCustomerRequest {
  return {
    type: v.type,
    companyName: v.type === 'Business' ? emptyToNull(v.companyName) : null,
    salutation: emptyToNull(v.salutation),
    firstName: emptyToNull(v.firstName),
    lastName: emptyToNull(v.lastName),
    email: emptyToNull(v.email),
    phone: emptyToNull(v.phone),
    billingStreet: emptyToNull(v.billingStreet),
    billingPostalCode: emptyToNull(v.billingPostalCode),
    billingCity: emptyToNull(v.billingCity),
    billingCountry: emptyToNull(v.billingCountry)?.toUpperCase() ?? 'DE',
    hasServiceAddress: v.hasServiceAddress,
    serviceStreet: v.hasServiceAddress ? emptyToNull(v.serviceStreet) : null,
    servicePostalCode: v.hasServiceAddress ? emptyToNull(v.servicePostalCode) : null,
    serviceCity: v.hasServiceAddress ? emptyToNull(v.serviceCity) : null,
    serviceCountry: v.hasServiceAddress ? emptyToNull(v.serviceCountry)?.toUpperCase() ?? null : null,
    vatId: v.type === 'Business' ? emptyToNull(v.vatId) : null,
    notes: emptyToNull(v.notes),
    followUpOptOut: v.followUpOptOut,
    rowVersion,
  };
}

/** Loads the customer (edit mode), then mounts the form with its initial values. */
export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id || undefined;
  const existing = useCustomer(editId);
  const [reloadCount, setReloadCount] = useState(0);

  if (!editId) return <CustomerFormBody initial={emptyCustomer} rowVersion={null} />;
  if (existing.isPending) return <LoadingView />;
  if (existing.isError) {
    return (
      <Screen>
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }
  return (
    <CustomerFormBody
      key={reloadCount}
      editId={editId}
      initial={fromDto(existing.data)}
      rowVersion={existing.data.rowVersion}
      onReload={async () => {
        await existing.refetch();
        setReloadCount((n) => n + 1);
      }}
    />
  );
}

function CustomerFormBody({
  editId, initial, rowVersion: initialRowVersion, onReload,
}: { editId?: string; initial: CustomerForm; rowVersion: string | null; onReload?: () => Promise<void> }) {
  const companyId = useCompanyId();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const allowLeave = useRef(false);
  // Frozen at mount so a background refetch cannot bypass the optimistic-concurrency check.
  const [rowVersion] = useState(initialRowVersion);
  const [formError, setFormError] = useState<string | null>(null);

  const { control, handleSubmit, setError, formState: { errors, isSubmitting, isDirty } } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema) as Resolver<CustomerForm>,
    defaultValues: initial,
  });
  const type = useWatch({ control, name: 'type' });
  const hasServiceAddress = useWatch({ control, name: 'hasServiceAddress' });

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowLeave.current || !isDirty) return;
      e.preventDefault();
      Alert.alert('Änderungen verwerfen?', 'Die Eingaben wurden noch nicht gespeichert.', [
        { text: 'Weiter bearbeiten', style: 'cancel' },
        { text: 'Verwerfen', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  const onValid = async (values: CustomerForm) => {
    setFormError(null);
    try {
      const body = toRequest(values, editId ? rowVersion : null);
      const saved = editId ? await api.customers.update(companyId, editId, body) : await api.customers.create(companyId, body);
      queryClient.setQueryData(keys.customer(companyId, saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: keys.customers(companyId) });
      allowLeave.current = true;
      toast(editId ? 'Kunde gespeichert' : 'Kunde angelegt');
      if (editId) router.back();
      else router.replace(`/customer/${saved.id}`);
    } catch (error) {
      if (isConflict(error)) {
        setFormError('Der Kunde wurde zwischenzeitlich geändert. Bitte neu laden – Ihre Eingaben gehen dabei verloren.');
        Alert.alert('Kunde wurde geändert', 'Eine andere Person hat diesen Kunden gespeichert.', [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Neu laden', onPress: () => void onReload?.() },
        ]);
        return;
      }
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  };

  const onSubmit = () => handleSubmit(onValid)();

  const field = (name: TextKey, label: string, extra: Partial<TextFieldProps> = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <TextField label={label} value={(value as string) ?? ''} onChangeText={onChange} onBlur={onBlur} error={errors[name]?.message} testID={`customer-${name}`} {...extra} />
      )}
    />
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: editId ? 'Kunde bearbeiten' : 'Neuer Kunde' }} />
      <FormScroll>
        <Controller
          control={control}
          name="type"
          render={({ field: { onChange, value } }) => (
            <SegmentedControl
              accessibilityLabel="Kundenart"
              options={[
                { value: 'Business', label: 'Geschäftskunde' },
                { value: 'Private', label: 'Privatkunde' },
              ]}
              value={value}
              onChange={onChange}
            />
          )}
        />
        <Card style={styles.card}>
          {type === 'Business' ? field('companyName', 'Firmenname', { required: true, autoComplete: 'organization' }) : null}
          {field('salutation', 'Anrede', { placeholder: 'z. B. Frau, Herr' })}
          <View style={styles.row}>
            <View style={styles.flex}>{field('firstName', 'Vorname', { autoComplete: 'given-name' })}</View>
            <View style={styles.flex}>{field('lastName', 'Nachname', { required: type === 'Private', autoComplete: 'family-name' })}</View>
          </View>
          {field('email', 'E-Mail', { keyboardType: 'email-address', autoCapitalize: 'none', autoComplete: 'email' })}
          {field('phone', 'Telefon', { keyboardType: 'phone-pad', autoComplete: 'tel' })}
        </Card>

        <SectionHeader title="Rechnungsadresse" />
        <Card style={styles.card}>
          {field('billingStreet', 'Straße und Hausnummer', { autoComplete: 'street-address' })}
          <View style={styles.row}>
            <View style={styles.postal}>{field('billingPostalCode', 'PLZ', { keyboardType: 'number-pad', autoComplete: 'postal-code' })}</View>
            <View style={styles.flex}>{field('billingCity', 'Ort')}</View>
          </View>
          {field('billingCountry', 'Land (ISO-Code)', { autoCapitalize: 'characters', maxLength: 2, hint: 'z. B. DE, AT, CH' })}
        </Card>

        <Card style={styles.card}>
          <Controller
            control={control}
            name="hasServiceAddress"
            render={({ field: { onChange, value } }) => (
              <SwitchRow label="Abweichende Leistungsadresse" description="z. B. Baustelle oder Objektadresse" value={value} onChange={onChange} />
            )}
          />
          {hasServiceAddress ? (
            <>
              {field('serviceStreet', 'Straße und Hausnummer')}
              <View style={styles.row}>
                <View style={styles.postal}>{field('servicePostalCode', 'PLZ', { keyboardType: 'number-pad' })}</View>
                <View style={styles.flex}>{field('serviceCity', 'Ort')}</View>
              </View>
              {field('serviceCountry', 'Land (ISO-Code)', { autoCapitalize: 'characters', maxLength: 2 })}
            </>
          ) : null}
        </Card>

        <SectionHeader title="Weitere Angaben" />
        <Card style={styles.card}>
          {type === 'Business' ? field('vatId', 'USt-IdNr.', { autoCapitalize: 'characters' }) : null}
          {field('notes', 'Notizen (intern)', { multiline: true })}
          <Controller
            control={control}
            name="followUpOptOut"
            render={({ field: { onChange, value } }) => (
              <SwitchRow label="Keine automatischen Erinnerungen" description="Für diesen Kunden werden keine Nachfass-E-Mails geplant." value={value} onChange={onChange} />
            )}
          />
        </Card>

        <InlineError message={formError} />
        <Button label={editId ? 'Änderungen speichern' : 'Kunde anlegen'} icon="save-outline" onPress={() => void onSubmit()} loading={isSubmitting} testID="customer-submit" />
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1 },
  postal: { width: 110 },
});
