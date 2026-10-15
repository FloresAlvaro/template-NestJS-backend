import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from '../../auth/types/auth.types';
export const auditContext = new AsyncLocalStorage<AuthUser | undefined>();
