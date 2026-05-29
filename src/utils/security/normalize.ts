// Email normalization for cross-system comparison. Used by Phase 6 invites
// (invitee email match on accept) and any future code that needs to match
// emails across different write sites (e.g. user signup vs invite creation).
//
// Phase 5's `blindIndex()` in crypto.ts uses only `.toLowerCase().trim()` for
// historical reasons — its outputs are HMACs over existing DB rows and adding
// NFKC now would invalidate every previously-stored blind index. So this util
// is intentionally separate; do not unify until a blind-index rotation.
export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").toLowerCase().trim();
}
