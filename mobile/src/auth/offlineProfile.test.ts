import { expect, test } from 'vitest';
import type { Id } from '../../../backend/convex/_generated/dataModel';
import { profileForAccount } from './offlineProfile';

const profile = { _id: 'user-a' as Id<'users'>, name: 'A' };

test('an account change cannot reuse a delayed cached profile from the previous account or environment', () => {
  const cached = { accountKey: 'dev:user-a', profile };
  expect(profileForAccount('dev:user-a', undefined, cached)).toEqual(profile);
  expect(profileForAccount('dev:user-b', undefined, cached)).toBeUndefined();
  expect(
    profileForAccount('production:user-a', undefined, cached),
  ).toBeUndefined();
});

test('a confirmed server profile replaces the cache and a deleted profile cannot be restored from it', () => {
  const cached = { accountKey: 'dev:user-a', profile };
  const updated = { ...profile, name: 'Updated' };
  expect(profileForAccount('dev:user-a', updated, cached)).toEqual(updated);
  expect(profileForAccount('dev:user-a', null, cached)).toBeNull();
  expect(profileForAccount('dev:user-a', undefined, undefined)).toBeUndefined();
});
