import { emailSchema } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { applyServerErrors } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { api } from '@/lib/session';
import { space, useTheme } from '@/theme';

const schema = z.object({ email: emailSchema });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { tr } = useLocale();
  const { colors } = useTheme();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await api.auth.forgotPassword({ email: email.trim() });
      setSentTo(email.trim());
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['email']));
    }
  });

  if (sentTo) {
    return (
      <Screen>
        <FormScroll>
          <Card style={styles.card}>
            <Ionicons name="mail-open-outline" size={36} color={colors.brandText} />
            <Text variant="heading" accessibilityRole="header">
              {tr('Bitte prüfen Sie Ihr Postfach', 'Please check your inbox')}
            </Text>
            <Text variant="body" tone="secondary">
              {tr(
                `Falls ein Konto für ${sentTo} existiert, haben wir eine E-Mail mit einem Link zum Zurücksetzen des Passworts gesendet. Der Link ist nur begrenzt gültig. Öffnen Sie ihn im Browser und melden Sie sich danach hier mit dem neuen Passwort an.`,
                `If an account exists for ${sentTo}, we have sent an email with a link to reset the password. The link is only valid for a limited time. Open it in the browser, then sign in here with the new password.`,
              )}
            </Text>
            <Button label={tr('Zurück zur Anmeldung', 'Back to sign in')} onPress={() => router.back()} />
          </Card>
        </FormScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <FormScroll>
        <Card style={styles.card}>
          <Text variant="body" tone="secondary">
            {tr(
              'Geben Sie die E-Mail-Adresse Ihres Kontos ein. Sie erhalten einen Link, mit dem Sie ein neues Passwort festlegen.',
              'Enter the email address of your account. You will receive a link to set a new password.',
            )}
          </Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={tr('E-Mail-Adresse', 'Email address')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={() => void onSubmit()}
                testID="forgot-email"
              />
            )}
          />
          <InlineError message={formError} />
          <View>
            <Button label={tr('Link anfordern', 'Request link')} onPress={() => void onSubmit()} loading={isSubmitting} testID="forgot-submit" />
          </View>
        </Card>
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
});
