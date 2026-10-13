// /auth, /me and /invitations endpoints.
import type {
  AcceptInvitationRequest,
  AuthResponse,
  ChangePasswordRequest,
  DeleteAccountRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  VerifyEmailRequest,
} from '@angebotpilot/api-contracts';
import type { HttpHandler } from 'msw';
import { db } from '../db';
import { addAudit, appLink, captureEmail } from '../domain';
import { newId, nowIso, randomToken, type UserRec } from '../model';
import {
  acceptedEmpty,
  authRoute,
  badRequest,
  clean,
  conflict,
  FieldErrors,
  fileResponse,
  json,
  noContent,
  notFound,
  readJson,
  route,
  unauthorized,
  userFromRequest,
} from './http';
import { toMe } from './mappers';

const PASSWORD_MIN = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function issueTokens(user: UserRec): AuthResponse {
  const now = Date.now();
  return {
    accessToken: `mock-access.${user.id}.${randomToken(24)}`,
    accessTokenExpiresAt: new Date(now + 15 * 60_000).toISOString(),
    refreshToken: `mock-refresh.${user.id}.${randomToken(32)}`,
    refreshTokenExpiresAt: new Date(now + 30 * 86_400_000).toISOString(),
    user: toMe(user),
  };
}

function findUserByEmail(email: string | null | undefined): UserRec | undefined {
  const normalised = (email ?? '').trim().toLowerCase();
  return db.users.find((u) => u.email.toLowerCase() === normalised);
}

function sendVerificationEmail(user: UserRec): void {
  const token = randomToken(32);
  db.authTokens.push({ token, userId: user.id, kind: 'verify', createdAt: nowIso() });
  captureEmail(
    db,
    user.email,
    'Bitte bestätigen Sie Ihre E-Mail-Adresse',
    `Hallo ${user.displayName},\n\nbitte bestätigen Sie Ihre E-Mail-Adresse für AngebotPilot:\n${appLink(`/verify-email?token=${token}`)}\n\nDer Link ist 48 Stunden gültig.\n\nIhr AngebotPilot-Team`,
  );
}

function checkNewPassword(errors: FieldErrors, field: string, password: string | null | undefined): void {
  if (!password || password.length < PASSWORD_MIN) errors.add(field, `Das Passwort muss mindestens ${PASSWORD_MIN} Zeichen lang sein.`);
}

const invalidInvitation = () => notFound('Diese Einladung ist ungültig oder abgelaufen.', 'invitation_not_found');

export const authHandlers: HttpHandler[] = [
  // ---------- auth ----------
  route('post', '/auth/register', async ({ request }) => {
    const body = await readJson<Partial<RegisterRequest>>(request);
    const errors = new FieldErrors();
    const email = clean(body.email)?.toLowerCase() ?? null;
    if (!email || !EMAIL_RE.test(email)) errors.add('email', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.');
    if (!clean(body.displayName)) errors.add('displayName', 'Bitte geben Sie Ihren Namen ein.');
    checkNewPassword(errors, 'password', body.password);
    if (body.acceptTerms !== true) errors.add('acceptTerms', 'Bitte akzeptieren Sie die AGB und die Datenschutzerklärung.');
    errors.throwIfAny();
    if (findUserByEmail(email)) {
      throw conflict('email_taken', 'Für diese E-Mail-Adresse besteht bereits ein Konto. Bitte melden Sie sich an oder setzen Sie Ihr Passwort zurück.');
    }
    const user: UserRec = {
      id: newId(),
      email: email ?? '',
      password: body.password ?? '',
      displayName: clean(body.displayName) ?? '',
      emailVerified: false,
      createdAt: nowIso(),
    };
    db.users.push(user);
    sendVerificationEmail(user);
    return json(issueTokens(user));
  }),

  route('post', '/auth/login', async ({ request }) => {
    const body = await readJson<Partial<LoginRequest>>(request);
    const user = findUserByEmail(body.email);
    if (!user || user.password !== body.password) {
      throw unauthorized('invalid_credentials', 'E-Mail-Adresse oder Passwort ist falsch.');
    }
    return json(issueTokens(user));
  }),

  route('post', '/auth/refresh', async ({ request }) => {
    const body = await readJson<RefreshRequest>(request);
    const match = /^mock-refresh\.([^.]+)\.\S+$/.exec(body.refreshToken ?? '');
    const user = match ? db.users.find((u) => u.id === match[1]) : undefined;
    if (!user) throw unauthorized('invalid_refresh_token', 'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.');
    return json(issueTokens(user));
  }),

  route('post', '/auth/logout', () => noContent()),

  route('post', '/auth/forgot-password', async ({ request }) => {
    const body = await readJson<Partial<ForgotPasswordRequest>>(request);
    const user = findUserByEmail(body.email);
    if (user) {
      const token = randomToken(32);
      db.authTokens.push({ token, userId: user.id, kind: 'reset', createdAt: nowIso() });
      captureEmail(
        db,
        user.email,
        'Passwort zurücksetzen',
        `Hallo ${user.displayName},\n\nüber den folgenden Link können Sie ein neues Passwort festlegen:\n${appLink(`/reset-password?token=${token}`)}\n\nDer Link ist 60 Minuten gültig. Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.\n\nIhr AngebotPilot-Team`,
      );
    }
    // Never reveal whether an account exists.
    return acceptedEmpty();
  }),

  route('post', '/auth/reset-password', async ({ request }) => {
    const body = await readJson<Partial<ResetPasswordRequest>>(request);
    if (!body.token || body.token === 'invalid') {
      throw badRequest('invalid_token', 'Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an.');
    }
    const errors = new FieldErrors();
    checkNewPassword(errors, 'newPassword', body.newPassword);
    errors.throwIfAny();
    const stored = db.authTokens.find((t) => t.token === body.token && t.kind === 'reset');
    if (stored) {
      const user = db.users.find((u) => u.id === stored.userId);
      if (user) user.password = body.newPassword ?? user.password;
      db.authTokens = db.authTokens.filter((t) => t !== stored);
    }
    return noContent();
  }),

  route('post', '/auth/verify-email', async ({ request }) => {
    const body = await readJson<Partial<VerifyEmailRequest>>(request);
    if (!body.token || body.token === 'invalid') {
      throw badRequest('invalid_token', 'Der Bestätigungslink ist ungültig oder abgelaufen.');
    }
    const stored = db.authTokens.find((t) => t.token === body.token && t.kind === 'verify');
    const user = (stored ? db.users.find((u) => u.id === stored.userId) : undefined) ?? userFromRequest(request);
    if (!user) throw badRequest('invalid_token', 'Der Bestätigungslink ist ungültig oder abgelaufen.');
    user.emailVerified = true;
    db.authTokens = db.authTokens.filter((t) => !(t.userId === user.id && t.kind === 'verify'));
    return noContent();
  }),

  authRoute('post', '/auth/resend-verification', ({ user }) => {
    if (!user.emailVerified) sendVerificationEmail(user);
    return acceptedEmpty();
  }),

  // ---------- me ----------
  authRoute('get', '/me', ({ user }) => json(toMe(user))),

  authRoute('patch', '/me', async ({ request, user }) => {
    const body = await readJson<Partial<UpdateProfileRequest>>(request);
    const name = clean(body.displayName);
    if (!name) throw badRequest('validation_failed', 'Bitte prüfen Sie Ihre Eingaben.', { displayName: ['Bitte geben Sie Ihren Namen ein.'] });
    user.displayName = name;
    return json(toMe(user));
  }),

  authRoute('post', '/me/change-password', async ({ request, user }) => {
    const body = await readJson<Partial<ChangePasswordRequest>>(request);
    if (body.currentPassword !== user.password) {
      throw badRequest('invalid_password', 'Das aktuelle Passwort ist falsch.', { currentPassword: ['Das aktuelle Passwort ist falsch.'] });
    }
    const errors = new FieldErrors();
    checkNewPassword(errors, 'newPassword', body.newPassword);
    errors.throwIfAny();
    user.password = body.newPassword ?? user.password;
    return noContent();
  }),

  authRoute('get', '/me/export', ({ user }) => {
    const data = {
      exportedAt: nowIso(),
      user: { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified, createdAt: user.createdAt },
      memberships: db.memberships
        .filter((m) => m.userId === user.id)
        .map((m) => ({ company: db.companies.find((c) => c.id === m.companyId)?.name ?? null, role: m.role, status: m.status, joinedAt: m.joinedAt })),
      notifications: db.notifications.filter((n) => n.userId === user.id).map((n) => ({ title: n.title, createdAt: n.createdAt, read: n.readAt !== null })),
    };
    return fileResponse(JSON.stringify(data, null, 2), 'application/json', 'angebotpilot-meine-daten.json');
  }),

  authRoute('post', '/me/delete', async ({ request, user }) => {
    const body = await readJson<Partial<DeleteAccountRequest>>(request);
    if (body.password !== user.password) {
      throw badRequest('invalid_password', 'Das Passwort ist falsch.', { password: ['Das Passwort ist falsch.'] });
    }
    const ownerships = db.memberships.filter((m) => m.userId === user.id && m.role === 'Owner' && m.status === 'Active');
    for (const own of ownerships) {
      const others = db.memberships.filter((m) => m.companyId === own.companyId && m.userId !== user.id && m.status === 'Active');
      const otherOwners = others.filter((m) => m.role === 'Owner');
      if (others.length > 0 && otherOwners.length === 0) {
        throw conflict(
          'sole_owner',
          'Sie sind die einzige Inhaberin bzw. der einzige Inhaber einer Firma mit weiteren Mitgliedern. Übertragen Sie zuerst die Inhaberrolle an ein anderes Mitglied.',
        );
      }
    }
    db.memberships = db.memberships.filter((m) => m.userId !== user.id);
    db.users = db.users.filter((u) => u.id !== user.id);
    db.notifications = db.notifications.filter((n) => n.userId !== user.id);
    return noContent();
  }),

  // ---------- invitations ----------
  route('get', '/invitations/:token', ({ params }) => {
    const invitation = db.invitations.find((i) => i.token === params.token && i.status === 'Pending' && i.expiresAt > nowIso());
    const company = invitation ? db.companies.find((c) => c.id === invitation.companyId) : undefined;
    if (!invitation || !company) throw invalidInvitation();
    return json({ companyName: company.name, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt });
  }),

  authRoute('post', '/invitations/accept', async ({ request, user }) => {
    const body = await readJson<Partial<AcceptInvitationRequest>>(request);
    const invitation = db.invitations.find((i) => i.token === body.token && i.status === 'Pending' && i.expiresAt > nowIso());
    if (!invitation || !db.companies.some((c) => c.id === invitation.companyId)) throw invalidInvitation();
    const existing = db.memberships.find((m) => m.companyId === invitation.companyId && m.userId === user.id);
    if (existing?.status === 'Active') throw conflict('already_member', 'Sie sind bereits Mitglied dieser Firma.');
    if (existing) {
      existing.status = 'Active';
      existing.role = invitation.role;
    } else {
      db.memberships.push({ id: newId(), companyId: invitation.companyId, userId: user.id, role: invitation.role, status: 'Active', joinedAt: nowIso() });
    }
    invitation.status = 'Accepted';
    addAudit(db, invitation.companyId, user.id, 'member.joined', 'Membership', null, user.displayName);
    return json(toMe(user));
  }),
];
