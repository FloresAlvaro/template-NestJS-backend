import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client';
export interface AuthUser {
  userId: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}
export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionHash?: string;
}
export const userSelect = {
  userId: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
} as const;
