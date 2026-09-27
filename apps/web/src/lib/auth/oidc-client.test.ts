import { describe, expect, it } from 'vitest';
import { getAccessToken, isOidcConfigured, safeReturnPath } from './oidc-client';

describe('browser OIDC client', () => {
  it('does not expose a server-side token or invent OIDC configuration', () => {
    expect(getAccessToken()).toBeNull();
    expect(isOidcConfigured()).toBe(false);
  });

  it('only permits local absolute post-login paths', () => {
    expect(safeReturnPath('/ar/analyses?view=recent')).toBe('/ar/analyses?view=recent');
    expect(safeReturnPath('//evil.example/path')).toBe('/');
    expect(safeReturnPath('https://evil.example/path')).toBe('/');
  });
});
