import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithContext } from '../http-request';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: RequestWithContext): Promise<string> {
    return Promise.resolve(request.user?.id ?? request.ip ?? 'unknown-client');
  }
}
