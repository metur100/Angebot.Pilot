import { ApiError, errorMessage, loginSchema, tr, type LoginForm } from '@angebotpilot/api-contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { FormScroll } from '@/components/Layout';
import { LegalLinks } from '@/components/LegalLinks';
import { LanguageSwitcher } from '@/components/Preferences';
import { InlineError } from '@/components/States';
import { Text } from '@/components/Text';
import { useLocale } from '@/lib/i18n';
import { login, useSession } from '@/lib/session';
import { makeStyles, radius, space } from '@/theme';

const icon = require('../../../assets/images/icon.png');

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 400) && !error.code?.startsWith('validation')) {
    return error.problem.detail ?? tr('E-Mail-Adresse oder Passwort ist falsch.', 'Email address or password is incorrect.');
  }
  return errorMessage(error);
}

export default function LoginScreen() {
  const router = useRouter();
  const { expired } = useSession();
  const { tr } = useLocale();
  const styles = useStyles();
  const passwordRef = useRef<TextInput>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
    } catch (error) {
      setFormError(loginErrorMessage(error));
    }
  });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FormScroll contentStyle={styles.content}>
        <View style={styles.brand}>
          <Image source={icon} style={styles.logo} accessible={false} />
          <Text variant="title" accessibilityRole="header">
            AngebotPilot
          </Text>
          <Text variant="body" tone="secondary" align="center">
            {tr('Angebote erstellen, nachfassen, Aufträge gewinnen.', 'Create quotations, follow up, win jobs.')}
          </Text>
        </View>

        {expired ? (
          <View style={styles.notice} accessibilityRole="alert" testID="session-expired">
            <Text variant="caption" tone="warning">
              {tr('Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.', 'Your session has expired. Please sign in again.')}
            </Text>
          </View>
        ) : null}

        <Card style={styles.card}>
          <Text variant="heading" accessibilityRole="header">
            {tr('Anmelden', 'Sign in')}
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
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                testID="login-email"
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
                secureToggle
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                testID="login-password"
              />
            )}
          />
          <InlineError message={formError} />
          <Button label={tr('Anmelden', 'Sign in')} onPress={() => void onSubmit()} loading={isSubmitting} testID="login-submit" />
          <Link href="/forgot-password" asChild>
            <Button label={tr('Passwort vergessen?', 'Forgot password?')} variant="ghost" />
          </Link>
        </Card>

        <View style={styles.registerBox}>
          <Text variant="body" tone="secondary">
            {tr('Noch kein Konto?', 'No account yet?')}
          </Text>
          <Button label={tr('Kostenlos registrieren', 'Sign up for free')} variant="outline" onPress={() => router.push('/register')} testID="go-register" />
        </View>

        <LanguageSwitcher />
        <LegalLinks />
      </FormScroll>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.background },
  content: { gap: space[5], paddingTop: space[8] },
  brand: { alignItems: 'center', gap: space[2] },
  logo: { width: 72, height: 72, borderRadius: radius.xl, marginBottom: space[2] },
  card: { gap: space[4] },
  notice: {
    padding: space[3], borderRadius: radius.lg, backgroundColor: colors.palette.warning.bg,
    borderWidth: 1, borderColor: colors.palette.warning.border,
  },
  registerBox: { alignItems: 'center', gap: space[2] },
}));
