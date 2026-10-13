import { emailSchema, roleLabel, type MemberDto, type MembershipRole } from '@angebotpilot/api-contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleSlash, Clock, Lock, MailPlus, UserMinus, UserPlus, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { useUser } from '@/app/auth';
import { useCompany, useMembers } from '@/app/company';
import { Restricted } from '@/components/domain/Common';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Alert, EmptyState, ErrorState, TableSkeleton } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { PageHeader, table } from '@/components/ui/Page';
import { toast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cx } from '@/lib/cx';
import { errorMessage, isForbidden } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { tr } from '@/lib/i18n';
import { qk } from '@/lib/queryKeys';
import { ADMIN_ONLY_HINT } from '@/lib/roles';

/** Role descriptions in the current UI language (getters, resolved on access). */
const roleDescriptions: Record<MembershipRole, string> = {
  get Owner() {
    return tr('Voller Zugriff inkl. Abo, Firmendaten löschen und Inhaberrechte.', 'Full access incl. subscription, deleting company data and owner rights.');
  },
  get Admin() {
    return tr('Alles außer Firma löschen: Team, Einstellungen, Export.', 'Everything except deleting the company: team, settings, export.');
  },
  get Employee() {
    return tr('Kunden, Angebote, Aufträge und Vorlagen bearbeiten.', 'Edit customers, quotations, jobs and templates.');
  },
};

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { companyId, role } = useCompany();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRole>('Employee');
  const [emailError, setEmailError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: () => api.companies.invite(companyId, { email: email.trim(), role: inviteRole }),
    onSuccess: (invitation) => {
      void queryClient.invalidateQueries({ queryKey: qk.invitations(companyId) });
      toast.success(tr('Einladung gesendet', 'Invitation sent'), invitation.email);
      setEmail('');
      onOpenChange(false);
    },
  });
  const submit = () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? tr('Bitte gültige E-Mail-Adresse angeben.', 'Please enter a valid email address.'));
      return;
    }
    setEmailError(null);
    invite.mutate();
  };
  const roles: MembershipRole[] = role === 'Owner' ? ['Employee', 'Admin', 'Owner'] : ['Employee', 'Admin'];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !invite.isPending && onOpenChange(next)}
      title={tr('Mitglied einladen', 'Invite member')}
      description={tr(
        'Die Person erhält eine E-Mail mit einem Einladungslink und legt damit ein Konto an oder meldet sich an.',
        'The person receives an email with an invitation link to create an account or sign in.',
      )}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{tr('Abbrechen', 'Cancel')}</Button>
          <Button variant="primary" icon={MailPlus} loading={invite.isPending} onClick={submit}>
            {tr('Einladung senden', 'Send invitation')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {invite.isError && (
          <Alert tone="danger" live>
            {errorMessage(invite.error)}
          </Alert>
        )}
        <Field label={tr('E-Mail-Adresse', 'Email address')} error={emailError ?? undefined} required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <Field label={tr('Rolle', 'Role')} hint={roleDescriptions[inviteRole]}>
          <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MembershipRole)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function MemberRow({ member, mobile }: { member: MemberDto; mobile?: boolean }) {
  const { companyId, role, can } = useCompany();
  const user = useUser();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<null | 'deactivate' | 'reactivate'>(null);
  const isSelf = member.userId === user.id;
  const canEditOwner = role === 'Owner';
  const editable = can.manageTeam && (member.role !== 'Owner' || canEditOwner);
  const changeRole = useMutation({
    mutationFn: (next: MembershipRole) => api.companies.updateMember(companyId, member.membershipId, { role: next }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: qk.members(companyId) });
      toast.success(tr('Rolle geändert', 'Role changed'), `${updated.displayName}: ${roleLabel[updated.role]}`);
    },
    onError: (e) => toast.error(tr('Rolle nicht geändert', 'Role not changed'), errorMessage(e)),
  });
  const roles: MembershipRole[] = canEditOwner ? ['Owner', 'Admin', 'Employee'] : ['Admin', 'Employee'];
  const active = member.status === 'Active';

  const roleControl = editable && active ? (
    <Select
      inputSize="sm"
      aria-label={tr(`Rolle von ${member.displayName}`, `Role of ${member.displayName}`)}
      value={member.role}
      disabled={changeRole.isPending}
      onChange={(e) => changeRole.mutate(e.target.value as MembershipRole)}
      className="w-[180px]"
    >
      {roles.map((r) => (
        <option key={r} value={r}>
          {roleLabel[r]}
        </option>
      ))}
    </Select>
  ) : (
    <Badge tone={member.role === 'Owner' ? 'info' : 'neutral'}>{roleLabel[member.role]}</Badge>
  );
  const status = active ? (
    <Badge tone="success" icon={CircleCheck}>
      {tr('Aktiv', 'Active')}
    </Badge>
  ) : (
    <Badge tone="muted" icon={CircleSlash}>
      {tr('Deaktiviert', 'Deactivated')}
    </Badge>
  );
  const action = editable && !isSelf && (
    <Button size="sm" variant={active ? 'dangerGhost' : 'secondary'} icon={active ? UserMinus : UserPlus} onClick={() => setConfirm(active ? 'deactivate' : 'reactivate')}>
      {active ? tr('Deaktivieren', 'Deactivate') : tr('Reaktivieren', 'Reactivate')}
    </Button>
  );
  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      onOpenChange={(o) => !o && setConfirm(null)}
      title={
        confirm === 'deactivate'
          ? tr(`${member.displayName} deaktivieren?`, `Deactivate ${member.displayName}?`)
          : tr(`${member.displayName} reaktivieren?`, `Reactivate ${member.displayName}?`)
      }
      description={
        confirm === 'deactivate'
          ? tr(
              'Die Person verliert sofort den Zugriff auf diese Firma. Ihre Angebote und Aufträge bleiben erhalten. Sie können sie später reaktivieren.',
              'The person loses access to this company immediately. Their quotations and jobs are kept. You can reactivate them later.',
            )
          : tr(
              'Die Person erhält wieder Zugriff mit ihrer bisherigen Rolle. Das zählt zum Mitgliederlimit Ihres Tarifs.',
              "The person regains access with their previous role. This counts towards your plan's member limit.",
            )
      }
      confirmLabel={confirm === 'deactivate' ? tr('Deaktivieren', 'Deactivate') : tr('Reaktivieren', 'Reactivate')}
      variant={confirm === 'deactivate' ? 'danger' : 'primary'}
      onConfirm={async () => {
        if (confirm === 'deactivate') await api.companies.deactivateMember(companyId, member.membershipId);
        else await api.companies.reactivateMember(companyId, member.membershipId);
        await queryClient.invalidateQueries({ queryKey: qk.members(companyId) });
        toast.success(confirm === 'deactivate' ? tr('Mitglied deaktiviert', 'Member deactivated') : tr('Mitglied reaktiviert', 'Member reactivated'));
      }}
    />
  );
  const name = (
    <div className="min-w-0">
      <p className="truncate font-medium text-neutral-900">
        {member.displayName}
        {isSelf && <span className="ml-1.5 text-[13px] font-normal text-neutral-500">{tr('(Sie)', '(you)')}</span>}
      </p>
      <p className="truncate text-[13px] text-neutral-500">{member.email}</p>
    </div>
  );

  if (mobile) {
    return (
      <li className="space-y-2.5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          {name}
          {status}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {roleControl}
          {action}
        </div>
        {dialog}
      </li>
    );
  }
  return (
    <tr className={cx(table.row, !active && 'opacity-70')}>
      <td className={cx(table.td, 'max-w-[320px]')}>{name}</td>
      <td className={table.td}>{roleControl}</td>
      <td className={table.td}>{status}</td>
      <td className={cx(table.td, 'text-neutral-600')}>{formatDate(member.joinedAt)}</td>
      <td className={cx(table.td, 'text-right')}>
        {action}
        {dialog}
      </td>
    </tr>
  );
}

function Invitations() {
  const { companyId, can } = useCompany();
  const queryClient = useQueryClient();
  const invitations = useQuery({ queryKey: qk.invitations(companyId), queryFn: () => api.companies.invitations(companyId), enabled: can.manageTeam });
  const [revoke, setRevoke] = useState<{ id: string; email: string } | null>(null);
  if (!can.manageTeam) return null;
  return (
    <Card>
      <CardHeader
        title={tr('Offene Einladungen', 'Pending invitations')}
        description={tr('Einladungen sind zeitlich begrenzt gültig.', 'Invitations are only valid for a limited time.')}
      />
      {invitations.isPending ? (
        <TableSkeleton rows={2} columns={3} />
      ) : invitations.isError ? (
        <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />
      ) : invitations.data.length === 0 ? (
        <EmptyState compact icon={MailPlus} title={tr('Keine offenen Einladungen', 'No pending invitations')} />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {invitations.data.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{inv.email}</p>
                <p className="text-[13px] text-neutral-500">
                  {roleLabel[inv.role]} ·{' '}
                  {tr(
                    `eingeladen am ${formatDate(inv.createdAt)} · gültig bis ${formatDateTime(inv.expiresAt)}`,
                    `invited on ${formatDate(inv.createdAt)} · valid until ${formatDateTime(inv.expiresAt)}`,
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {inv.isExpired ? (
                  <Badge tone="warning" icon={Clock}>
                    {tr('Abgelaufen', 'Expired')}
                  </Badge>
                ) : (
                  <Badge tone="info" icon={Clock}>
                    {tr('Ausstehend', 'Pending')}
                  </Badge>
                )}
                <IconButton
                  size="sm"
                  icon={X}
                  label={tr(`Einladung an ${inv.email} zurückziehen`, `Revoke invitation to ${inv.email}`)}
                  onClick={() => setRevoke({ id: inv.id, email: inv.email })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={revoke !== null}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={tr('Einladung zurückziehen?', 'Revoke invitation?')}
        description={tr(
          `Der Einladungslink an ${revoke?.email ?? ''} funktioniert danach nicht mehr.`,
          `The invitation link sent to ${revoke?.email ?? ''} will no longer work.`,
        )}
        confirmLabel={tr('Zurückziehen', 'Revoke')}
        variant="danger"
        onConfirm={async () => {
          if (!revoke) return;
          await api.companies.revokeInvitation(companyId, revoke.id);
          await queryClient.invalidateQueries({ queryKey: qk.invitations(companyId) });
          toast.success(tr('Einladung zurückgezogen', 'Invitation revoked'));
        }}
      />
    </Card>
  );
}

export default function TeamPage() {
  const { can } = useCompany();
  const members = useMembers();
  const [inviting, setInviting] = useState(false);
  const sorted = [...(members.data ?? [])].sort(
    (a, b) => (a.status === b.status ? 0 : a.status === 'Active' ? -1 : 1) || a.displayName.localeCompare(b.displayName, 'de-DE'),
  );

  return (
    <>
      <PageHeader
        title="Team"
        description={tr('Wer in Ihrer Firma mit AngebotPilot arbeitet – und mit welchen Rechten.', 'Who in your company works with AngebotPilot – and with which permissions.')}
        actions={
          <Restricted allowed={can.manageTeam} hint={ADMIN_ONLY_HINT}>
            <Button variant="primary" icon={can.manageTeam ? UserPlus : Lock} disabled={!can.manageTeam} onClick={() => setInviting(true)}>
              {tr('Mitglied einladen', 'Invite member')}
            </Button>
          </Restricted>
        }
      />
      <div className="space-y-6">
        {!can.manageTeam && (
          <Alert tone="neutral" icon={Lock} title={tr('Nur Lesezugriff', 'Read-only access')}>
            {tr(
              'Teammitglieder einladen, Rollen ändern und Zugänge deaktivieren können Inhaber:innen und Administrator:innen.',
              'Owners and admins can invite team members, change roles and deactivate access.',
            )}
          </Alert>
        )}
        <Card>
          <CardHeader
            title={tr('Mitglieder', 'Members')}
            description={
              members.data
                ? tr(
                    `${members.data.filter((m) => m.status === 'Active').length} aktiv`,
                    `${members.data.filter((m) => m.status === 'Active').length} active`,
                  )
                : undefined
            }
          />
          {members.isPending ? (
            <TableSkeleton rows={4} columns={4} />
          ) : members.isError ? (
            isForbidden(members.error) ? (
              <div className="p-5">
                <Alert tone="neutral" icon={Lock}>
                  {tr('Die Mitgliederliste ist für Ihre Rolle nicht freigegeben.', 'The member list is not available for your role.')}
                </Alert>
              </div>
            ) : (
              <ErrorState error={members.error} onRetry={() => void members.refetch()} />
            )
          ) : sorted.length === 0 ? (
            <EmptyState compact icon={UsersRound} title={tr('Noch keine Mitglieder', 'No members yet')} />
          ) : (
            <>
              <div className={cx(table.wrapper, 'hidden md:block')}>
                <table className={table.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={table.th}>Name</th>
                      <th scope="col" className={table.th}>{tr('Rolle', 'Role')}</th>
                      <th scope="col" className={table.th}>Status</th>
                      <th scope="col" className={table.th}>{tr('Dabei seit', 'Member since')}</th>
                      <th scope="col" className={table.th}><span className="sr-only">{tr('Aktionen', 'Actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m) => (
                      <MemberRow key={m.membershipId} member={m} />
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-neutral-100 md:hidden">
                {sorted.map((m) => (
                  <MemberRow key={m.membershipId} member={m} mobile />
                ))}
              </ul>
            </>
          )}
        </Card>
        <Invitations />
        <Card className="px-5 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">{tr('Rollen im Überblick', 'Roles at a glance')}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {(['Owner', 'Admin', 'Employee'] as const).map((r) => (
              <div key={r}>
                <dt className="text-[13px] font-medium text-neutral-800">{roleLabel[r]}</dt>
                <dd className="text-[13px] text-neutral-500">{roleDescriptions[r]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      {inviting && <InviteDialog open onOpenChange={setInviting} />}
    </>
  );
}
