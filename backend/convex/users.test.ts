import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { createTestBackend, learnerIdentity } from './test-support.helpers';

describe('learner identity', () => {
  test('provisions one profile from the authenticated identity across repeated logins', async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);

    expect(await learner.query(api.users.current, {})).toBeNull();
    const firstLogin = await learner.mutation(api.users.ensureCurrentUser, {});
    const nextLogin = await learner.mutation(api.users.ensureCurrentUser, {});

    expect(nextLogin).toEqual(firstLogin);
    expect(await learner.query(api.users.current, {})).toMatchObject({
      _id: firstLogin._id,
      tokenIdentifier: learnerIdentity.tokenIdentifier,
      name: learnerIdentity.name,
      email: learnerIdentity.email,
      imageUrl: learnerIdentity.pictureUrl,
    });
    expect(
      await backend.run(async (ctx) => await ctx.db.query('users').take(2)),
    ).toHaveLength(1);
  });

  test("refreshes profile claims without changing the learner's identity", async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    const original = await learner.mutation(api.users.ensureCurrentUser, {});
    const updatedSession = backend.withIdentity({
      ...learnerIdentity,
      name: 'Akira Tanaka',
      email: 'akira.tanaka@example.com',
      pictureUrl: 'https://example.com/akira-new.png',
    });

    const updated = await updatedSession.mutation(
      api.users.ensureCurrentUser,
      {},
    );
    expect(updated).toMatchObject({
      _id: original._id,
      _creationTime: original._creationTime,
      name: 'Akira Tanaka',
      email: 'akira.tanaka@example.com',
      imageUrl: 'https://example.com/akira-new.png',
    });
    expect(await updatedSession.query(api.users.current, {})).toEqual(updated);

    const sessionWithoutProfile = backend.withIdentity({
      subject: learnerIdentity.subject,
      issuer: learnerIdentity.issuer,
      tokenIdentifier: learnerIdentity.tokenIdentifier,
    });
    await sessionWithoutProfile.mutation(api.users.ensureCurrentUser, {});
    const withoutProfile = await sessionWithoutProfile.query(
      api.users.current,
      {},
    );
    expect(withoutProfile?._id).toBe(original._id);
    expect(withoutProfile).not.toHaveProperty('name');
    expect(withoutProfile).not.toHaveProperty('email');
    expect(withoutProfile).not.toHaveProperty('imageUrl');
  });

  test('keeps profiles private even when another issuer reuses a subject or email', async () => {
    const backend = createTestBackend();
    const firstLearner = backend.withIdentity(learnerIdentity);
    const secondLearner = backend.withIdentity({
      ...learnerIdentity,
      subject: 'user_other',
      tokenIdentifier: `${learnerIdentity.issuer}|user_other`,
      name: 'Hana',
    });
    const otherIssuer = backend.withIdentity({
      ...learnerIdentity,
      issuer: 'https://another-issuer.example.com',
      tokenIdentifier: 'https://another-issuer.example.com|user_learner',
      name: 'Different Akira',
    });

    const firstProfile = await firstLearner.mutation(
      api.users.ensureCurrentUser,
      {},
    );
    expect(await secondLearner.query(api.users.current, {})).toBeNull();
    expect(await otherIssuer.query(api.users.current, {})).toBeNull();
    const secondProfile = await secondLearner.mutation(
      api.users.ensureCurrentUser,
      {},
    );
    const otherProfile = await otherIssuer.mutation(
      api.users.ensureCurrentUser,
      {},
    );

    expect(
      new Set([firstProfile._id, secondProfile._id, otherProfile._id]).size,
    ).toBe(3);
    expect(await firstLearner.query(api.users.current, {})).toEqual(
      firstProfile,
    );
    expect(await secondLearner.query(api.users.current, {})).toEqual(
      secondProfile,
    );
    expect(await otherIssuer.query(api.users.current, {})).toEqual(
      otherProfile,
    );
  });

  test('anonymous callers cannot read or provision a learner profile', async () => {
    const backend = createTestBackend();
    const learner = backend.withIdentity(learnerIdentity);
    const existing = await learner.mutation(api.users.ensureCurrentUser, {});

    await expect(backend.query(api.users.current, {})).rejects.toThrow(
      'Not authenticated',
    );
    await expect(
      backend.mutation(api.users.ensureCurrentUser, {}),
    ).rejects.toThrow('Not authenticated');
    expect(await learner.query(api.users.current, {})).toEqual(existing);
    expect(
      await backend.run(async (ctx) => await ctx.db.query('users').take(2)),
    ).toHaveLength(1);
  });
});
