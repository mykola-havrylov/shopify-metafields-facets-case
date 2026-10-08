/**
 * Throws when an Admin API mutation returned `userErrors`.
 * Message: `<action> failed: <field.path>: <message> (<code>); ...` (the code only when the error has one).
 */
export function assertNoUserErrors(action, userErrors) {
  if (userErrors.length === 0) return;

  const details = userErrors.map(
    ({ field, message, code }) => `${(field ?? []).join('.')}: ${message}${code ? ` (${code})` : ''}`,
  );
  throw new Error(`${action} failed: ${details.join('; ')}`);
}
