export type AuthenticatedUser = {
  id: string;
  mode: 'anonymous' | 'oidc';
  email?: string;
  name?: string;
};
