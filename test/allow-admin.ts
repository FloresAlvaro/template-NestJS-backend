import type { ExecutionContext } from '@nestjs/common';
export const allowAdmin = {
  canActivate(context: ExecutionContext) {
    context.switchToHttp().getRequest<{ user: unknown }>().user = {
      userId: 0,
      role: 'ADMIN',
      name: 'Test',
      email: 'test@example.test',
      isActive: true,
    };
    return true;
  },
};
