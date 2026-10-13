import { companySchema, type CompanyForm } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';

import { Button, IconButton } from '@/components/Button';
import { Card, SectionHeader } from '@/components/Card';
import { SelectField, TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { InlineError } from '@/components/States';
import { TAX_DISCLAIMER, taxModeOptions } from '@/components/TaxModeInfo';
import { Text } from '@/components/Text';
import { applyServerErrors, emptyToNull } from '@/lib/forms';
import { api, logout, reloadUser, useSession } from '@/lib/session';
import { space } from '@/theme';

const FIELDS = ['name', 'addressLine1', 'postalCode', 'city', 'email', 'phone', 'vatId', 'defaultTaxMode', 'quotationPrefix'] as const;

export default function OnboardingScreen() {
  const { user } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: '', addressLine1: '', postalCode: '', city: '', email: user?.email ?? '', phone: '', vatId: '',
      defaultTaxMode: 'Standard', quotationPrefix: '',
    },
  });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      const company = await api.companies.create({
        name: v.name.trim(),
        addressLine1: emptyToNull(v.addressLine1),
        postalCode: emptyToNull(v.postalCode),
        city: emptyToNull(v.city),
        country: 'DE',
        email: emptyToNull(v.email),
        phone: emptyToNull(v.phone),
        vatId: emptyToNull(v.vatId),
        defaultTaxMode: v.defaultTaxMode,
        quotationPrefix: emptyToNull(v.quotationPrefix),
      });
      await reloadUser(company.id);
    } catch (error) {
      setFormError(applyServerErrors(error, setError, FIELDS));
    }
  });

  const text = (name: Exclude<(typeof FIELDS)[number], 'defaultTaxMode'>, label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <TextField label={label} value={value ?? ''} onChangeText={onChange} onBlur={onBlur} error={errors[name]?.message} testID={`company-${name}`} {...extra} />
      )}
    />
  );

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon="log-out-outline" accessibilityLabel="Abmelden" onPress={() => void logout()} />,
        }}
      />
      <FormScroll>
        <Text variant="body" tone="secondary">
          Willkommen{user?.displayName ? `, ${user.displayName}` : ''}! Legen Sie Ihr Unternehmen an. Diese Angaben erscheinen auf
          Ihren Angeboten und lassen sich später ändern.
        </Text>
        <Card style={styles.card}>
          {text('name', 'Firmenname', { required: true, autoComplete: 'organization' })}
          {text('addressLine1', 'Straße und Hausnummer', { autoComplete: 'street-address' })}
          {text('postalCode', 'PLZ', { keyboardType: 'number-pad', autoComplete: 'postal-code', maxLength: 5 })}
          {text('city', 'Ort')}
          {text('email', 'E-Mail für Angebote', { keyboardType: 'email-address', autoCapitalize: 'none' })}
          {text('phone', 'Telefon', { keyboardType: 'phone-pad', autoComplete: 'tel' })}
        </Card>

        <SectionHeader title="Steuern & Nummernkreis" />
        <Card style={styles.card}>
          <Controller
            control={control}
            name="defaultTaxMode"
            render={({ field: { onChange, value } }) => (
              <SelectField label="Standard-Besteuerung" value={value} options={taxModeOptions} onChange={onChange} testID="company-taxMode" />
            )}
          />
          <Text variant="caption" tone="muted">
            {TAX_DISCLAIMER}
          </Text>
          {text('vatId', 'USt-IdNr. (optional)', { autoCapitalize: 'characters', hint: 'Format z. B. DE123456789' })}
          {text('quotationPrefix', 'Präfix für Angebotsnummern (optional)', { autoCapitalize: 'characters', hint: 'z. B. AN → AN-2026-0001', maxLength: 8 })}
        </Card>

        <InlineError message={formError} />
        <Button label="Unternehmen anlegen" icon="business-outline" onPress={() => void onSubmit()} loading={isSubmitting} testID="company-submit" />
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
});
