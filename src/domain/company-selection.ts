/** A preference only: the server-provided membership list always decides access. */
export const companySelectionKey = (userId: string) =>
  `truckcontrol-company-selection-v1:${userId}`;

export function readCompanySelection(userId: string): string | null {
  try {
    return localStorage.getItem(companySelectionKey(userId));
  } catch {
    return null;
  }
}

export function rememberCompanySelection(
  userId: string,
  organizationId: string,
) {
  try {
    localStorage.setItem(companySelectionKey(userId), organizationId);
  } catch {
    // Failure to persist a preference must never block or grant company access.
  }
}

export function chooseCompany(
  memberships: { id: string }[],
  current: string | null,
  remembered: string | null,
): string | null {
  return (
    [current, remembered].find((id) =>
      memberships.some((company) => company.id === id),
    ) ??
    memberships[0]?.id ??
    null
  );
}
