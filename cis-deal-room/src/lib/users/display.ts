/**
 * Returns a human-facing display string for a user. Prefers "First Last"
 * when both name fields are set; otherwise falls back to email.
 *
 * Auth identity (sessions, email-keyed rate limits) continues to use
 * `email`. This helper is strictly for UI strings.
 */
export function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const first = user.firstName?.trim();
  const last = user.lastName?.trim();
  if (first && last) return `${first} ${last}`;
  return user.email;
}
