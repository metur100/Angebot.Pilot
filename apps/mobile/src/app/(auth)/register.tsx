import { registerSchema, type RegisterForm } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View, type TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Checkbox, TextField } from '@/components/Field';
import { FormScroll, Screen } from '@/components/Layout';
import { LegalLinks } from '@/components/LegalLinks';
import { LanguageSwitcher } from '@/components/Preferences';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { legalUrls } from '@/lib/config';
import { applyServerErrors, openExternal } from '@/lib/forms';
import { useLocale } from '@/lib/i18n';
import { register } from '@/lib/session';
import { space } from '@/theme';

type FormValues = Omit<RegisterForm, 'acceptTerms'> & { acceptTerms: boolean };

export default function RegisterScreen() {
  const { tr } = useLocale();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(registerSchema) as never,
    defaultValues: { displayName: '', email: '', password: '', acceptTerms: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await register({ displayName: values.displayName.trim(), email: values.email, password: values.password, acceptTerms: values.acceptTerms });
    } catch (error) {
      setFormError(applyServerErrors(error, setError, ['displayName', 'email', 'password', 'acceptTerms']));
    }
  });

  return (
    <Screen>
      <FormScroll>
        <Text variant="body" tone="secondary">
          {tr(
            'Erstellen Sie Ihr Konto. Im nächsten Schritt legen Sie Ihr Unternehmen an.',
            'Create your account. In the next step you will set up your company.',
          )}
        </Text>
        <Card style={styles.card}>
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={tr('Ihr Name', 'Your name')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.displayName?.message}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                required
                testID="register-name"
              />
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                ref={emailRef}
                label={tr('E-Mail-Adresse', 'Email address')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                required
                testID="register-email"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                ref={passwordRef}
                label={tr('Passwort', 'Password')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                hint={tr('Mindestens 10 Zeichen, mit Buchstaben und Ziffern.', 'At least 10 characters, with letters and digits.')}
                secureToggle
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                required
                testID="register-password"
              />
            )}
          />
          <Controller
            control={control}
            name="acceptTerms"
            render={({ field: { onChange, value } }) => (
              <Checkbox
                label={tr(
                  'Ich akzeptiere die AGB und habe die Datenschutzerklärung gelesen.',
                  'I accept the terms and conditions and have read the privacy policy.',
                )}
                checked={value}
                onChange={onChange}
                error={errors.acceptTerms?.message}
                testID="register-terms"
              >
                <Text variant="body">
                  {tr('Ich akzeptiere die', 'I accept the')}{' '}
                  <Text variant="body" tone="brand" accessibilityRole="link" onPress={() => void openExternal(legalUrls.terms)}>
                    {tr('AGB', 'terms and conditions')}
                  </Text>{' '}
                  {tr('und habe die', 'and have read the')}{' '}
                  <Text variant="body" tone="brand" accessibilityRole="link" onPress={() => void openExternal(legalUrls.privacy)}>
                    {tr('Datenschutzerklärung', 'privacy policy')}
                  </Text>
                  {tr(' gelesen.', '.')}
                </Text>
              </Checkbox>
            )}
          />
          <InlineError message={formError} />
          <Button label={tr('Konto erstellen', 'Create account')} onPress={() => void onSubmit()} loading={isSubmitting} testID="register-submit" />
        </Card>
        <View style={styles.legal}>
          <LanguageSwitcher />
          <LegalLinks />
        </View>
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  legal: { marginTop: space[2], gap: space[3] },
});
