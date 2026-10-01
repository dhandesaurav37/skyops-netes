import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { systemObservability } from '../observability/metrics';
import { runWithRequestContext } from './requestContext';

export interface CorrelatedRequest extends Request {
  id?: string;
  startTime?: number;
}

export function correlationIdMiddleware(
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction
): void {
  const suppliedRequestId = req.headers['x-request-id'];
  const reqId = typeof suppliedRequestId === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(suppliedRequestId)
    ? suppliedRequestId
    : crypto.randomUUID();
  req.id = reqId;
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', reqId);
  res.setHeader('X-SkyOps-Platform', 'Enterprise-v1');

  // Hook into response finish to record self-observability metrics
  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    systemObservability.recordRequest(res.statusCode, duration);
  });

  runWithRequestContext({ requestId: reqId, ipAddress: req.ip }, next);
}

export function sendApiError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  req?: CorrelatedRequest
): Response {
  const requestId = req?.id || (res.getHeader('x-request-id') as string) || crypto.randomUUID();
  return res.status(statusCode).json({
    error: message,
    errorDetails: {
      code,
      message,
      requestId
    }
  });
}
