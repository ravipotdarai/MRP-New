import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as admin from 'firebase-admin';
import { getAdminApp } from '../firebase/admin';
import { IS_ADMIN_KEY, IS_PUBLIC_KEY } from './auth.decorators';
import { isAllowlistedAdmin } from './admin-emails';
import { AUTH_USER_KEY, AuthUser } from './auth.types';

type ReqWithUser = {
  headers: Record<string, string | string[] | undefined>;
  [AUTH_USER_KEY]?: AuthUser;
};

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Verifies Firebase ID token (Bearer) via Admin SDK.
 * Health stays `@Public()`. Optional local bypass: MRP_AUTH_BYPASS=1 + X-MRP-Dev-Uid.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<ReqWithUser>();
    const user = await this.resolveUser(req);
    req[AUTH_USER_KEY] = user;

    const adminOnly = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (adminOnly && !user.isAdmin) {
      throw new UnauthorizedException('Admin allowlist required');
    }
    return true;
  }

  private async resolveUser(req: ReqWithUser): Promise<AuthUser> {
    const bypass =
      process.env.MRP_AUTH_BYPASS === '1' &&
      process.env.NODE_ENV !== 'production';
    if (bypass) {
      const devUid = headerValue(req.headers, 'x-mrp-dev-uid')?.trim();
      if (devUid) {
        const email =
          headerValue(req.headers, 'x-mrp-dev-email')?.trim().toLowerCase() ||
          null;
        return {
          uid: devUid,
          email,
          isAdmin: isAllowlistedAdmin(email),
        };
      }
    }

    const authHeader = headerValue(req.headers, 'authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Empty Bearer token');
    }

    const app = getAdminApp();
    if (!app) {
      throw new ServiceUnavailableException(
        'Firebase Admin not configured — cannot verify JWT',
      );
    }

    try {
      const decoded = await admin.auth(app).verifyIdToken(token);
      const email = decoded.email?.toLowerCase() ?? null;
      return {
        uid: decoded.uid,
        email,
        isAdmin: isAllowlistedAdmin(email),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }
  }
}
