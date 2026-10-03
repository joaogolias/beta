import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig } from './config';

const development = {
  environment: 'development',
  clerkPublishableKey: 'pk_test_valid',
  convexUrl: 'https://example-123.convex.cloud',
};

describe('separação de ambientes mobile', () => {
  it('normaliza a Cloud URL de um ambiente válido', () => {
    expect(
      parseRuntimeConfig({
        ...development,
        convexUrl: `${development.convexUrl}/`,
      }).convexUrl,
    ).toBe(development.convexUrl);
  });
  it('rejeita chave de desenvolvimento em produção e chave de produção em desenvolvimento', () => {
    expect(() =>
      parseRuntimeConfig({ ...development, environment: 'production' }),
    ).toThrow('Clerk');
    expect(() =>
      parseRuntimeConfig({
        ...development,
        clerkPublishableKey: 'pk_live_valid',
      }),
    ).toThrow('Clerk');
  });
  it.each([
    'http://example-123.convex.cloud',
    'https://example-123.convex.site',
    'https://secret@example-123.convex.cloud',
    'https://example-123.convex.cloud/api',
    'bad',
  ])('rejeita endereço de backend incorreto: %s', (convexUrl) => {
    expect(() => parseRuntimeConfig({ ...development, convexUrl })).toThrow();
  });
  it('não aceita placeholders ou ambiente indefinido', () => {
    expect(() =>
      parseRuntimeConfig({
        ...development,
        clerkPublishableKey: 'pk_test_replace_with_your_key',
      }),
    ).toThrow();
    expect(() =>
      parseRuntimeConfig({ ...development, environment: undefined }),
    ).toThrow();
  });
});
