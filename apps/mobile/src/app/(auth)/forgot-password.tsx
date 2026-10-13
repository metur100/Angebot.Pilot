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
import { api } from '@/lib/session';
import { colors, space } from '@/theme';

const schema = z.object({ email: emailSchema });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
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
            <Ionicons name="mail-open-outline" size={36} color={colors.brand} />
            <Text variant="heading" accessibilityRole="header">
              Bitte prüfen Sie Ihr Postfach
            </Text>
            <Text variant="body" tone="secondary">
              Falls ein Konto für {sentTo} existiert, haben wir eine E-Mail mit einem Link zum Zurücksetzen des Passworts
              gesendet. Der Link ist nur begrenzt gültig. Öffnen Sie ihn im Browser und melden Sie sich danach hier mit dem
              neuen Passwort an.
            </Text>
            <Button label="Zurück zur Anmeldung" onPress={() => router.back()} />
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
            Geben Sie die E-Mail-Adresse Ihres Kontos ein. Sie erhalten einen Link, mit dem Sie ein neues Passwort festlegen.
          </Text>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="E-Mail-Adresse"
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
            <Button label="Link anfordern" onPress={() => void onSubmit()} loading={isSubmitting} testID="forgot-submit" />
          </View>
        </Card>
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
});
