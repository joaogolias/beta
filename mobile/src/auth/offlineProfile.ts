import type { Doc } from '../../../backend/convex/_generated/dataModel';

type Profile = Pick<Doc<'users'>, '_id' | 'name' | 'email'>;

export interface CachedAccountProfile {
  accountKey: string;
  profile: Profile | null;
}

/** A delayed cache read must never supply another account's profile. */
export function profileForAccount(
  accountKey: string,
  onlineProfile: Profile | null | undefined,
  cached: CachedAccountProfile | undefined,
): Profile | null | undefined {
  // A confirmed missing server profile must be provisioned again online.
  if (onlineProfile !== undefined) return onlineProfile;
  return cached?.accountKey === accountKey ? cached.profile : undefined;
}
