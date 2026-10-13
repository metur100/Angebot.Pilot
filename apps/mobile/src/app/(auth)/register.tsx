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
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { legalUrls } from '@/lib/config';
import { applyServerErrors, openExternal } from '@/lib/forms';
import { register } from '@/lib/session';
import { space } from '@/theme';

type FormValues = Omit<RegisterForm, 'acceptTerms'> & { acceptTerms: boolean };

export default function RegisterScreen() {
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
          Erstellen Sie Ihr Konto. Im nächsten Schritt legen Sie Ihr Unternehmen an.
        </Text>
        <Card style={styles.card}>
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Ihr Name"
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
                label="E-Mail-Adresse"
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
                label="Passwort"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                hint="Mindestens 10 Zeichen, mit Buchstaben und Ziffern."
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
                label="Ich akzeptiere die AGB und habe die Datenschutzerklärung gelesen."
                checked={value}
                onChange={onChange}
                error={errors.acceptTerms?.message}
                testID="register-terms"
              >
                <Text variant="body">
                  Ich akzeptiere die{' '}
                  <Text variant="body" tone="brand" accessibilityRole="link" onPress={() => void openExternal(legalUrls.terms)}>
                    AGB
                  </Text>{' '}
                  und habe die{' '}
                  <Text variant="body" tone="brand" accessibilityRole="link" onPress={() => void openExternal(legalUrls.privacy)}>
                    Datenschutzerklärung
                  </Text>{' '}
                  gelesen.
                </Text>
              </Checkbox>
            )}
          />
          <InlineError message={formError} />
          <Button label="Konto erstellen" onPress={() => void onSubmit()} loading={isSubmitting} testID="register-submit" />
        </Card>
        <View style={styles.legal}>
          <LegalLinks />
        </View>
      </FormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space[4] },
  legal: { marginTop: space[2] },
});
