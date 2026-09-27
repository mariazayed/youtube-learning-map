import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithContext } from '../common/http-request';
import { AuthService } from './auth.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const publicRoute = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (publicRoute) return true;

    const request = context.switchToHttp().getRequest<RequestWithContext>();
    request.user = await this.auth.authenticate(
      request.header('authorization'),
      request.header('x-client-id'),
    );
    return true;
  }
}
