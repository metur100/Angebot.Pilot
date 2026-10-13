import {
  companySchema, errorMessage, formatPercent, roleLabel, taxModeLabel, type CompanyDto,
} from '@angebotpilot/api-contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card, KeyValue, SectionHeader } from '@/components/Card';
import { TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { Badge } from '@/components/StatusBadge';
import { ErrorState, InlineError, ListSkeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { emptyToNull, isConflict } from '@/lib/forms';
import { keys, useCompany, useCompanySettings, useTaxRates } from '@/lib/queries';
import { api, canManageCompany, reloadUser, useCompanyId, useMembership } from '@/lib/session';
import { space } from '@/theme';

type Draft = Pick<CompanyDto, 'name'> & Record<'addressLine1' | 'addressLine2' | 'postalCode' | 'city' | 'country' | 'email' | 'phone' | 'website' | 'vatId' | 'taxNumber', string>;

function toDraft(c: CompanyDto): Draft {
  return {
    name: c.name, addressLine1: c.addressLine1 ?? '', addressLine2: c.addressLine2 ?? '', postalCode: c.postalCode ?? '', city: c.city ?? '',
    country: c.country ?? 'DE', email: c.email ?? '', phone: c.phone ?? '', website: c.website ?? '', vatId: c.vatId ?? '', taxNumber: c.taxNumber ?? '',
  };
}

const basicSchema = companySchema.pick({ name: true, postalCode: true, email: true, vatId: true });

function days(n: number) {
  return `${n} ${n === 1 ? 'Tag' : 'Tagen'}`;
}

export default function CompanyScreen() {
  const companyId = useCompanyId();
  const membership = useMembership();
  const canEdit = canManageCompany(membership);
  const queryClient = useQueryClient();
  const toast = useToast();
  const company = useCompany();
  const settings = useCompanySettings();
  const taxRates = useTaxRates();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (company.isPending) return <Screen><ListSkeleton rows={3} /></Screen>;
  if (company.isError || !company.data) {
    return (
      <Screen>
        <ErrorState error={company.error} onRetry={() => void company.refetch()} />
      </Screen>
    );
  }
  const c = company.data;
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const save = async () => {
    if (!draft) return;
    const parsed = basicSchema.safeParse({ name: draft.name, postalCode: draft.postalCode, email: draft.email, vatId: draft.vatId });
    if (!parsed.success) {
      const next: Partial<Record<keyof Draft, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof Draft] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    setFormError(null);
    try {
      const updated = await api.companies.update(companyId, {
        name: draft.name.trim(), addressLine1: emptyToNull(draft.addressLine1), addressLine2: emptyToNull(draft.addressLine2),
        postalCode: emptyToNull(draft.postalCode), city: emptyToNull(draft.city), country: (emptyToNull(draft.country) ?? 'DE').toUpperCase(),
        email: emptyToNull(draft.email), phone: emptyToNull(draft.phone), website: emptyToNull(draft.website), vatId: emptyToNull(draft.vatId),
        taxNumber: emptyToNull(draft.taxNumber), brandColor: c.brandColor, timeZone: c.timeZone, language: c.language, rowVersion: c.rowVersion,
      });
      queryClient.setQueryData(keys.company(companyId), updated);
      if (updated.name !== c.name) void reloadUser();
      setDraft(null);
      toast('Unternehmensdaten gespeichert');
    } catch (e) {
      if (isConflict(e)) {
        setFormError('Die Daten wurden zwischenzeitlich geändert. Die aktuelle Fassung wurde geladen – bitte erneut bearbeiten.');
        setDraft(null);
        void company.refetch();
      } else {
        setFormError(errorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  };

  const s = settings.data;
  const address = [c.addressLine1, c.addressLine2, [c.postalCode, c.city].filter(Boolean).join(' '), c.country !== 'DE' ? c.country : null].filter(Boolean).join('\n');

  return (
    <Screen>
      <FormScroll refreshing={company.isRefetching} onRefresh={draft ? undefined : () => void company.refetch()}>
        <View style={styles.badges}>
          {membership ? <Badge label={`Ihre Rolle: ${roleLabel[membership.role]}`} tone="info" icon="person-outline" /> : null}
          {c.isDemo ? <Badge label="Demo-Unternehmen" tone="warning" icon="flask-outline" /> : null}
        </View>
        {!canEdit ? (
          <Text variant="caption" tone="secondary">
            Nur Inhaber:innen und Administrator:innen können die Unternehmensdaten ändern.
          </Text>
        ) : null}

        <SectionHeader
          title="Profil"
          action={canEdit && !draft ? <Button label="Bearbeiten" icon="create-outline" variant="ghost" size="sm" fullWidth={false} onPress={() => setDraft(toDraft(c))} testID="company-edit" /> : null}
        />
        <InlineError message={formError} />
        {draft ? (
          <Card style={styles.form}>
            <TextField label="Firmenname" value={draft.name} onChangeText={set('name')} error={errors.name} required />
            <TextField label="Adresszeile 1" value={draft.addressLine1} onChangeText={set('addressLine1')} />
            <TextField label="Adresszeile 2" value={draft.addressLine2} onChangeText={set('addressLine2')} />
            <View style={styles.row}>
              <View style={styles.postal}>
                <TextField label="PLZ" value={draft.postalCode} onChangeText={set('postalCode')} error={errors.postalCode} keyboardType="number-pad" />
              </View>
              <View style={styles.flex}>
                <TextField label="Ort" value={draft.city} onChangeText={set('city')} />
              </View>
            </View>
            <TextField label="Land (ISO-Code)" value={draft.country} onChangeText={set('country')} autoCapitalize="characters" maxLength={2} />
            <TextField label="E-Mail" value={draft.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
            <TextField label="Telefon" value={draft.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
            <TextField label="Website" value={draft.website} onChangeText={set('website')} keyboardType="url" autoCapitalize="none" />
            <TextField label="USt-IdNr." value={draft.vatId} onChangeText={set('vatId')} error={errors.vatId} autoCapitalize="characters" />
            <TextField label="Steuernummer" value={draft.taxNumber} onChangeText={set('taxNumber')} />
            <View style={styles.row}>
              <Button label="Abbrechen" variant="outline" onPress={() => setDraft(null)} style={styles.flex} />
              <Button label="Speichern" icon="save-outline" onPress={() => void save()} loading={saving} style={styles.flex} testID="company-save" />
            </View>
          </Card>
        ) : (
          <Card>
            <KeyValue label="Firmenname" value={c.name} strong />
            <KeyValue label="Adresse" value={address || '–'} />
            <KeyValue label="E-Mail" value={c.email ?? '–'} />
            <KeyValue label="Telefon" value={c.phone ?? '–'} />
            {c.website ? <KeyValue label="Website" value={c.website} /> : null}
            <KeyValue label="USt-IdNr." value={c.vatId ?? '–'} />
            {c.taxNumber ? <KeyValue label="Steuernummer" value={c.taxNumber} /> : null}
          </Card>
        )}

        <SectionHeader title="Angebote & Steuern" />
        <Card>
          {settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} compact /> : null}
          {s ? (
            <>
              <KeyValue label="Standard-Besteuerung" value={taxModeLabel[s.defaultTaxMode]} />
              <KeyValue label="Nummernkreis" value={`${s.quotationPrefix} (Angebote) · ${s.jobPrefix} (Aufträge)`} />
              <KeyValue label="Standard-Gültigkeit" value={`${s.defaultValidityDays} ${s.defaultValidityDays === 1 ? 'Tag' : 'Tage'}`} />
            </>
          ) : null}
          {taxRates.data?.length ? (
            <KeyValue
              label="Steuersätze"
              value={taxRates.data
                .filter((r) => !r.isArchived)
                .map((r) => `${r.name}: ${formatPercent(r.ratePercent)}${r.isDefault ? ' (Standard)' : ''}`)
                .join('\n')}
            />
          ) : null}
        </Card>

        <SectionHeader title="Nachfassen (Erinnerungen)" />
        <Card testID="followup-settings">
          {s ? (
            <>
              <KeyValue label="1. Erinnerung" value={s.firstReminderEnabled ? `nach ${days(s.firstReminderAfterDays)}` : 'aus'} />
              <KeyValue label="2. Erinnerung" value={s.secondReminderEnabled ? `nach ${days(s.secondReminderAfterDays)}` : 'aus'} />
              <KeyValue label="Vor Ablauf" value={s.expiryReminderEnabled ? `${days(s.expiryReminderDaysBefore)} vor Gültigkeitsende` : 'aus'} />
              <KeyValue label="PDF an E-Mails anhängen" value={s.attachPdfToEmails ? 'ja' : 'nein'} />
              <KeyValue label="Benachrichtigung bei Kundenentscheidung" value={s.notifyOnCustomerDecision ? 'ja' : 'nein'} />
              <Text variant="small" tone="muted" style={styles.note}>
                Nachfass-Einstellungen, Texte, Bankverbindung und Logo ändern Sie in der Web-App.
              </Text>
            </>
          ) : settings.isPending ? (
            <Text variant="caption" tone="muted">Wird geladen …</Text>
          ) : null}
        </Card>
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  form: { gap: space[4] },
  row: { flexDirection: 'row', gap: space[3] },
  flex: { flex: 1 },
  postal: { width: 110 },
  note: { marginTop: space[2] },
});
