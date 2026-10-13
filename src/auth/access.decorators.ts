import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
