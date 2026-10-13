import {
  companySchema, errorMessage, formatPercent, roleLabel, taxModeLabel, tr, type CompanyDto,
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
import { useLocale } from '@/lib/i18n';
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

/** Dative in German ("nach 7 Tagen"). */
function days(n: number) {
  return tr(`${n} ${n === 1 ? 'Tag' : 'Tagen'}`, `${n} ${n === 1 ? 'day' : 'days'}`);
}

export default function CompanyScreen() {
  const companyId = useCompanyId();
  const { tr } = useLocale();
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
      toast(tr('Unternehmensdaten gespeichert', 'Company details saved'));
    } catch (e) {
      if (isConflict(e)) {
        setFormError(
          tr(
            'Die Daten wurden zwischenzeitlich geändert. Die aktuelle Fassung wurde geladen – bitte erneut bearbeiten.',
            'The details were changed in the meantime. The current version has been loaded – please edit again.',
          ),
        );
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
  const off = tr('aus', 'off');
  const yes = tr('ja', 'yes');
  const no = tr('nein', 'no');
  const address = [c.addressLine1, c.addressLine2, [c.postalCode, c.city].filter(Boolean).join(' '), c.country !== 'DE' ? c.country : null].filter(Boolean).join('\n');

  return (
    <Screen>
      <FormScroll refreshing={company.isRefetching} onRefresh={draft ? undefined : () => void company.refetch()}>
        <View style={styles.badges}>
          {membership ? <Badge label={`${tr('Ihre Rolle', 'Your role')}: ${roleLabel[membership.role]}`} tone="info" icon="person-outline" /> : null}
          {c.isDemo ? <Badge label={tr('Demo-Unternehmen', 'Demo company')} tone="warning" icon="flask-outline" /> : null}
        </View>
        {!canEdit ? (
          <Text variant="caption" tone="secondary">
            {tr('Nur Inhaber:innen und Administrator:innen können die Unternehmensdaten ändern.', 'Only owners and administrators can change the company details.')}
          </Text>
        ) : null}

        <SectionHeader
          title={tr('Profil', 'Profile')}
          action={canEdit && !draft ? <Button label={tr('Bearbeiten', 'Edit')} icon="create-outline" variant="ghost" size="sm" fullWidth={false} onPress={() => setDraft(toDraft(c))} testID="company-edit" /> : null}
        />
        <InlineError message={formError} />
        {draft ? (
          <Card style={styles.form}>
            <TextField label={tr('Firmenname', 'Company name')} value={draft.name} onChangeText={set('name')} error={errors.name} required />
            <TextField label={tr('Adresszeile 1', 'Address line 1')} value={draft.addressLine1} onChangeText={set('addressLine1')} />
            <TextField label={tr('Adresszeile 2', 'Address line 2')} value={draft.addressLine2} onChangeText={set('addressLine2')} />
            <View style={styles.row}>
              <View style={styles.postal}>
                <TextField label={tr('PLZ', 'Postcode')} value={draft.postalCode} onChangeText={set('postalCode')} error={errors.postalCode} keyboardType="number-pad" />
              </View>
              <View style={styles.flex}>
                <TextField label={tr('Ort', 'City')} value={draft.city} onChangeText={set('city')} />
              </View>
            </View>
            <TextField label={tr('Land (ISO-Code)', 'Country (ISO code)')} value={draft.country} onChangeText={set('country')} autoCapitalize="characters" maxLength={2} />
            <TextField label={tr('E-Mail', 'Email')} value={draft.email} onChangeText={set('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" />
            <TextField label={tr('Telefon', 'Phone')} value={draft.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
            <TextField label="Website" value={draft.website} onChangeText={set('website')} keyboardType="url" autoCapitalize="none" />
            <TextField label={tr('USt-IdNr.', 'VAT ID')} value={draft.vatId} onChangeText={set('vatId')} error={errors.vatId} autoCapitalize="characters" />
            <TextField label={tr('Steuernummer', 'Tax number')} value={draft.taxNumber} onChangeText={set('taxNumber')} />
            <View style={styles.row}>
              <Button label={tr('Abbrechen', 'Cancel')} variant="outline" onPress={() => setDraft(null)} style={styles.flex} />
              <Button label={tr('Speichern', 'Save')} icon="save-outline" onPress={() => void save()} loading={saving} style={styles.flex} testID="company-save" />
            </View>
          </Card>
        ) : (
          <Card>
            <KeyValue label={tr('Firmenname', 'Company name')} value={c.name} strong />
            <KeyValue label={tr('Adresse', 'Address')} value={address || '–'} />
            <KeyValue label={tr('E-Mail', 'Email')} value={c.email ?? '–'} />
            <KeyValue label={tr('Telefon', 'Phone')} value={c.phone ?? '–'} />
            {c.website ? <KeyValue label="Website" value={c.website} /> : null}
            <KeyValue label={tr('USt-IdNr.', 'VAT ID')} value={c.vatId ?? '–'} />
            {c.taxNumber ? <KeyValue label={tr('Steuernummer', 'Tax number')} value={c.taxNumber} /> : null}
          </Card>
        )}

        <SectionHeader title={tr('Angebote & Steuern', 'Quotations & taxes')} />
        <Card>
          {settings.isError ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} compact /> : null}
          {s ? (
            <>
              <KeyValue label={tr('Standard-Besteuerung', 'Default tax treatment')} value={taxModeLabel[s.defaultTaxMode]} />
              <KeyValue
                label={tr('Nummernkreis', 'Number ranges')}
                value={tr(`${s.quotationPrefix} (Angebote) · ${s.jobPrefix} (Aufträge)`, `${s.quotationPrefix} (quotations) · ${s.jobPrefix} (jobs)`)}
              />
              <KeyValue
                label={tr('Standard-Gültigkeit', 'Default validity')}
                value={tr(`${s.defaultValidityDays} ${s.defaultValidityDays === 1 ? 'Tag' : 'Tage'}`, days(s.defaultValidityDays))}
              />
            </>
          ) : null}
          {taxRates.data?.length ? (
            <KeyValue
              label={tr('Steuersätze', 'Tax rates')}
              value={taxRates.data
                .filter((r) => !r.isArchived)
                .map((r) => `${r.name}: ${formatPercent(r.ratePercent)}${r.isDefault ? tr(' (Standard)', ' (default)') : ''}`)
                .join('\n')}
            />
          ) : null}
        </Card>

        <SectionHeader title={tr('Nachfassen (Erinnerungen)', 'Follow-ups (reminders)')} />
        <Card testID="followup-settings">
          {s ? (
            <>
              <KeyValue
                label={tr('1. Erinnerung', '1st reminder')}
                value={s.firstReminderEnabled ? tr(`nach ${days(s.firstReminderAfterDays)}`, `after ${days(s.firstReminderAfterDays)}`) : off}
              />
              <KeyValue
                label={tr('2. Erinnerung', '2nd reminder')}
                value={s.secondReminderEnabled ? tr(`nach ${days(s.secondReminderAfterDays)}`, `after ${days(s.secondReminderAfterDays)}`) : off}
              />
              <KeyValue
                label={tr('Vor Ablauf', 'Before expiry')}
                value={
                  s.expiryReminderEnabled
                    ? tr(`${days(s.expiryReminderDaysBefore)} vor Gültigkeitsende`, `${days(s.expiryReminderDaysBefore)} before the validity ends`)
                    : off
                }
              />
              <KeyValue label={tr('PDF an E-Mails anhängen', 'Attach PDF to emails')} value={s.attachPdfToEmails ? yes : no} />
              <KeyValue label={tr('Benachrichtigung bei Kundenentscheidung', 'Notify on customer decision')} value={s.notifyOnCustomerDecision ? yes : no} />
              <Text variant="small" tone="muted" style={styles.note}>
                {tr(
                  'Nachfass-Einstellungen, Texte, Bankverbindung und Logo ändern Sie in der Web-App.',
                  'Follow-up settings, texts, bank details and logo are changed in the web app.',
                )}
              </Text>
            </>
          ) : settings.isPending ? (
            <Text variant="caption" tone="muted">{tr('Wird geladen …', 'Loading …')}</Text>
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
