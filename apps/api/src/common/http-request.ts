import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';

export type RequestWithContext = Request & {
  requestId: string;
  user?: AuthenticatedUser;
};
