import type { MembershipRole } from '@angebotpilot/api-contracts';

export const isAdminRole = (role: MembershipRole | undefined) => role === 'Owner' || role === 'Admin';

/** What the current role may do in the UI. The server enforces the same rules. */
export function permissionsFor(role: MembershipRole | undefined) {
  const admin = isAdminRole(role);
  return {
    manageTeam: admin,
    manageCompany: admin,
    manageDocumentSettings: admin,
    manageBilling: admin,
    exportCsv: admin,
    deleteCustomers: admin,
    /** Company export and deletion. */
    ownerActions: role === 'Owner',
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;

export const ADMIN_ONLY_HINT = 'Nur für Inhaber:innen und Administrator:innen verfügbar.';
export const OWNER_ONLY_HINT = 'Nur für Inhaber:innen verfügbar.';
