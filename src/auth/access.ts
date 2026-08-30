/**
 * The portal's half of the access ladder. Mirrors pickerpal/src/lib/access.ts
 * — same three rungs, same one-sentence rule:
 *
 *   **A free account gets your own data; Plus gets everybody else's.**
 *
 * The tier is not derived here: it comes from the server on every sign-in
 * response and every GET /v1/auth/me (`tier`), because entitlement is the
 * server's fact to state. This module only answers "is that rung high
 * enough for this screen", so gating reads the same way everywhere.
 *
 * Nothing here is a security boundary — the API enforces the same ladder on
 * every request. This exists so the UI shows the right thing rather than
 * letting someone walk into a 403.
 */

export type AccessTier = 'anonymous' | 'account' | 'plus';

const ORDER: Record<AccessTier, number> = { anonymous: 0, account: 1, plus: 2 };

/** True when `tier` is at least `required` on the ladder. */
export function tierAtLeast(tier: AccessTier, required: AccessTier): boolean {
  return ORDER[tier] >= ORDER[required];
}

/**
 * Your own catalog, in full — prices, locations, notes, detail pages. Never
 * partially hidden: you typed it in, and hiding a picker's own price from
 * them would be nothing but a dark pattern.
 */
export function canViewOwnItems(tier: AccessTier): boolean {
  return tierAtLeast(tier, 'account');
}

/**
 * The crowd: other pickers' published finds — a shop's inventory, items
 * spotted near you, and filtering either by category or maker.
 */
export function canBrowseCrowdItems(tier: AccessTier): boolean {
  return tierAtLeast(tier, 'plus');
}

/** Favoriting items, shops and seller codes against your account. */
export function canFavorite(tier: AccessTier): boolean {
  return tierAtLeast(tier, 'account');
}
