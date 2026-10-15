import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthRequest } from '../../auth/types/auth.types';
import { auditContext } from '../context/audit-context';
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const actor = context.switchToHttp().getRequest<AuthRequest>().user;
    return new Observable((subscriber) =>
      auditContext.run(actor, () => next.handle().subscribe(subscriber)),
    );
  }
}
