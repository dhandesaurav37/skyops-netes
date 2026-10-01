import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestAuditContext {
  requestId: string;
  ipAddress?: string;
}

const requestContext = new AsyncLocalStorage<RequestAuditContext>();

export function runWithRequestContext<T>(context: RequestAuditContext, callback: () => T): T {
  return requestContext.run(context, callback);
}

export function getRequestAuditContext(): RequestAuditContext | undefined {
  return requestContext.getStore();
}
