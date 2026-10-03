/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

export function createTestBackend() {
  return convexTest(schema, modules);
}

export const learnerIdentity = {
  subject: 'user_learner',
  issuer: 'https://babel-crux-test.clerk.accounts.dev',
  tokenIdentifier: 'https://babel-crux-test.clerk.accounts.dev|user_learner',
  name: 'Akira',
  email: 'akira@example.com',
  pictureUrl: 'https://example.com/akira.png',
};
