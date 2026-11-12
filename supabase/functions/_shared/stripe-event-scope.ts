/** Account-scoped Stripe events may now include the same acct_ identity in
 * context. Never accept Connect/organization routing or a different context.
 * The caller must still verify HMAC and independently fetch /v1/account/Event.
 */
export function stripeEventMatchesAccount(
  event: Record<string, unknown>,
  expectedAccountId: string,
): boolean {
  return (
    /^acct_[A-Za-z0-9]{1,100}$/.test(expectedAccountId) &&
    event.account == null &&
    (event.context == null || event.context === expectedAccountId)
  );
}
