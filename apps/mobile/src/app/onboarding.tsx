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
import { taxDisclaimer, taxModeOptions } from '@/components/TaxModeInfo';
import { Text } from '@/components/Text';
import { applyServerErrors, emptyToNull } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { api, logout, reloadUser, useSession } from '@/lib/session';
import { space } from '@/theme';

const FIELDS = ['name', 'addressLine1', 'postalCode', 'city', 'email', 'phone', 'vatId', 'defaultTaxMode', 'quotationPrefix'] as const;

export default function OnboardingScreen() {
  const { user } = useSession();
  const { tr } = useLocale();
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
          headerRight: () => <IconButton icon="log-out-outline" accessibilityLabel={tr('Abmelden', 'Sign out')} onPress={() => void logout()} />,
        }}
      />
      <FormScroll>
        <Text variant="body" tone="secondary">
          {tr(
            `Willkommen${user?.displayName ? `, ${user.displayName}` : ''}! Legen Sie Ihr Unternehmen an. Diese Angaben erscheinen auf Ihren Angeboten und lassen sich später ändern.`,
            `Welcome${user?.displayName ? `, ${user.displayName}` : ''}! Set up your company. These details appear on your quotations and can be changed later.`,
          )}
        </Text>
        <Card style={styles.card}>
          {text('name', tr('Firmenname', 'Company name'), { required: true, autoComplete: 'organization' })}
          {text('addressLine1', tr('Straße und Hausnummer', 'Street and number'), { autoComplete: 'street-address' })}
          {text('postalCode', tr('PLZ', 'Postcode'), { keyboardType: 'number-pad', autoComplete: 'postal-code', maxLength: 5 })}
          {text('city', tr('Ort', 'City'))}
          {text('email', tr('E-Mail für Angebote', 'Email for quotations'), { keyboardType: 'email-address', autoCapitalize: 'none' })}
          {text('phone', tr('Telefon', 'Phone'), { keyboardType: 'phone-pad', autoComplete: 'tel' })}
        </Card>

        <SectionHeader title={tr('Steuern & Nummernkreis', 'Taxes & numbering')} />
        <Card style={styles.card}>
          <Controller
            control={control}
            name="defaultTaxMode"
            render={({ field: { onChange, value } }) => (
              <SelectField label={tr('Standard-Besteuerung', 'Default tax treatment')} value={value} options={taxModeOptions()} onChange={onChange} testID="company-taxMode" />
            )}
          />
          <Text variant="caption" tone="muted">
            {taxDisclaimer()}
          </Text>
          {text('vatId', tr('USt-IdNr. (optional)', 'VAT ID (optional)'), { autoCapitalize: 'characters', hint: tr('Format z. B. DE123456789', 'Format e.g. DE123456789') })}
          {text('quotationPrefix', tr('Präfix für Angebotsnummern (optional)', 'Quotation number prefix (optional)'), {
            autoCapitalize: 'characters', hint: tr('z. B. AN → AN-2026-0001', 'e.g. AN → AN-2026-0001'), maxLength: 8,
          })}
        </Card>

        <InlineError message={formError} />
        <Button label={tr('Unternehmen anlegen', 'Create company')} icon="business-outline" onPress={() => void onSubmit()} loading={isSubmitting} testID="company-submit" />
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
});
