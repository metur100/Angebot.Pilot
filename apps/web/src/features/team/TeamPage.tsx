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
import { qk } from '@/lib/queryKeys';
import { ADMIN_ONLY_HINT } from '@/lib/roles';

const roleDescriptions: Record<MembershipRole, string> = {
  Owner: 'Voller Zugriff inkl. Abo, Firmendaten löschen und Inhaberrechte.',
  Admin: 'Alles außer Firma löschen: Team, Einstellungen, Export.',
  Employee: 'Kunden, Angebote, Aufträge und Vorlagen bearbeiten.',
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
      toast.success('Einladung gesendet', invitation.email);
      setEmail('');
      onOpenChange(false);
    },
  });
  const submit = () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Bitte gültige E-Mail-Adresse angeben.');
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
      title="Mitglied einladen"
      description="Die Person erhält eine E-Mail mit einem Einladungslink und legt damit ein Konto an oder meldet sich an."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button variant="primary" icon={MailPlus} loading={invite.isPending} onClick={submit}>
            Einladung senden
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
        <Field label="E-Mail-Adresse" error={emailError ?? undefined} required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Rolle" hint={roleDescriptions[inviteRole]}>
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
      toast.success('Rolle geändert', `${updated.displayName}: ${roleLabel[updated.role]}`);
    },
    onError: (e) => toast.error('Rolle nicht geändert', errorMessage(e)),
  });
  const roles: MembershipRole[] = canEditOwner ? ['Owner', 'Admin', 'Employee'] : ['Admin', 'Employee'];
  const active = member.status === 'Active';

  const roleControl = editable && active ? (
    <Select
      inputSize="sm"
      aria-label={`Rolle von ${member.displayName}`}
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
    <Badge tone="success" icon={CircleCheck}>Aktiv</Badge>
  ) : (
    <Badge tone="muted" icon={CircleSlash}>Deaktiviert</Badge>
  );
  const action = editable && !isSelf && (
    <Button size="sm" variant={active ? 'dangerGhost' : 'secondary'} icon={active ? UserMinus : UserPlus} onClick={() => setConfirm(active ? 'deactivate' : 'reactivate')}>
      {active ? 'Deaktivieren' : 'Reaktivieren'}
    </Button>
  );
  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      onOpenChange={(o) => !o && setConfirm(null)}
      title={confirm === 'deactivate' ? `${member.displayName} deaktivieren?` : `${member.displayName} reaktivieren?`}
      description={
        confirm === 'deactivate'
          ? 'Die Person verliert sofort den Zugriff auf diese Firma. Ihre Angebote und Aufträge bleiben erhalten. Sie können sie später reaktivieren.'
          : 'Die Person erhält wieder Zugriff mit ihrer bisherigen Rolle. Das zählt zum Mitgliederlimit Ihres Tarifs.'
      }
      confirmLabel={confirm === 'deactivate' ? 'Deaktivieren' : 'Reaktivieren'}
      variant={confirm === 'deactivate' ? 'danger' : 'primary'}
      onConfirm={async () => {
        if (confirm === 'deactivate') await api.companies.deactivateMember(companyId, member.membershipId);
        else await api.companies.reactivateMember(companyId, member.membershipId);
        await queryClient.invalidateQueries({ queryKey: qk.members(companyId) });
        toast.success(confirm === 'deactivate' ? 'Mitglied deaktiviert' : 'Mitglied reaktiviert');
      }}
    />
  );
  const name = (
    <div className="min-w-0">
      <p className="truncate font-medium text-neutral-900">
        {member.displayName}
        {isSelf && <span className="ml-1.5 text-[13px] font-normal text-neutral-500">(Sie)</span>}
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
      <CardHeader title="Offene Einladungen" description="Einladungen sind zeitlich begrenzt gültig." />
      {invitations.isPending ? (
        <TableSkeleton rows={2} columns={3} />
      ) : invitations.isError ? (
        <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />
      ) : invitations.data.length === 0 ? (
        <EmptyState compact icon={MailPlus} title="Keine offenen Einladungen" />
      ) : (
        <ul className="divide-y divide-neutral-100">
          {invitations.data.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{inv.email}</p>
                <p className="text-[13px] text-neutral-500">
                  {roleLabel[inv.role]} · eingeladen am {formatDate(inv.createdAt)} · gültig bis {formatDateTime(inv.expiresAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {inv.isExpired ? <Badge tone="warning" icon={Clock}>Abgelaufen</Badge> : <Badge tone="info" icon={Clock}>Ausstehend</Badge>}
                <IconButton size="sm" icon={X} label={`Einladung an ${inv.email} zurückziehen`} onClick={() => setRevoke({ id: inv.id, email: inv.email })} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={revoke !== null}
        onOpenChange={(o) => !o && setRevoke(null)}
        title="Einladung zurückziehen?"
        description={`Der Einladungslink an ${revoke?.email ?? ''} funktioniert danach nicht mehr.`}
        confirmLabel="Zurückziehen"
        variant="danger"
        onConfirm={async () => {
          if (!revoke) return;
          await api.companies.revokeInvitation(companyId, revoke.id);
          await queryClient.invalidateQueries({ queryKey: qk.invitations(companyId) });
          toast.success('Einladung zurückgezogen');
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
        description="Wer in Ihrer Firma mit AngebotPilot arbeitet – und mit welchen Rechten."
        actions={
          <Restricted allowed={can.manageTeam} hint={ADMIN_ONLY_HINT}>
            <Button variant="primary" icon={can.manageTeam ? UserPlus : Lock} disabled={!can.manageTeam} onClick={() => setInviting(true)}>
              Mitglied einladen
            </Button>
          </Restricted>
        }
      />
      <div className="space-y-6">
        {!can.manageTeam && (
          <Alert tone="neutral" icon={Lock} title="Nur Lesezugriff">
            Teammitglieder einladen, Rollen ändern und Zugänge deaktivieren können Inhaber:innen und Administrator:innen.
          </Alert>
        )}
        <Card>
          <CardHeader title="Mitglieder" description={members.data ? `${members.data.filter((m) => m.status === 'Active').length} aktiv` : undefined} />
          {members.isPending ? (
            <TableSkeleton rows={4} columns={4} />
          ) : members.isError ? (
            isForbidden(members.error) ? (
              <div className="p-5">
                <Alert tone="neutral" icon={Lock}>Die Mitgliederliste ist für Ihre Rolle nicht freigegeben.</Alert>
              </div>
            ) : (
              <ErrorState error={members.error} onRetry={() => void members.refetch()} />
            )
          ) : sorted.length === 0 ? (
            <EmptyState compact icon={UsersRound} title="Noch keine Mitglieder" />
          ) : (
            <>
              <div className={cx(table.wrapper, 'hidden md:block')}>
                <table className={table.table}>
                  <thead>
                    <tr>
                      <th scope="col" className={table.th}>Name</th>
                      <th scope="col" className={table.th}>Rolle</th>
                      <th scope="col" className={table.th}>Status</th>
                      <th scope="col" className={table.th}>Dabei seit</th>
                      <th scope="col" className={table.th}><span className="sr-only">Aktionen</span></th>
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
          <h2 className="text-sm font-semibold text-neutral-900">Rollen im Überblick</h2>
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
