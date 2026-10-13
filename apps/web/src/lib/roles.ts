import { onLocaleChange, tr, type MembershipRole } from '@angebotpilot/api-contracts';

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

// Hints in the current UI language. Live bindings (let), re-assigned when the language changes, so importers that
// read them during render always get the current text.
export let ADMIN_ONLY_HINT = '';
export let OWNER_ONLY_HINT = '';

function localizeHints() {
  ADMIN_ONLY_HINT = tr('Nur für Inhaber:innen und Administrator:innen verfügbar.', 'Only available to owners and administrators.');
  OWNER_ONLY_HINT = tr('Nur für Inhaber:innen verfügbar.', 'Only available to owners.');
}

localizeHints();
onLocaleChange(localizeHints);
