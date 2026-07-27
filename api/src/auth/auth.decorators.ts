import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { AUTH_USER_KEY, AuthUser } from './auth.types';

/** Skip Firebase JWT (health only). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Require allowlisted admin email. */
export const IS_ADMIN_KEY = 'isAdmin';
export const AdminOnly = () => SetMetadata(IS_ADMIN_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ [AUTH_USER_KEY]?: AuthUser }>();
    const user = req[AUTH_USER_KEY];
    if (!user) {
      throw new UnauthorizedException('Not authenticated');
    }
    return user;
  },
);
