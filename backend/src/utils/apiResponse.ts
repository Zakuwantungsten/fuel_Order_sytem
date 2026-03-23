import { Response } from 'express';

interface EnvelopeMeta {
  requestId?: string;
  servedAt: string;
  validationErrors?: string[];
}

interface SuccessEnvelope<T = unknown> {
  success: true;
  message: string;
  data?: T;
  requestId?: string;
  servedAt: string;
  validationErrors?: string[];
}

const getMeta = (res: Response, validationErrors?: string[]): EnvelopeMeta => ({
  requestId: (res.req as any)?.requestId,
  servedAt: new Date().toISOString(),
  validationErrors,
});

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T,
  validationErrors?: string[]
): void => {
  const meta = getMeta(res, validationErrors);
  const body: SuccessEnvelope<T> = {
    success: true,
    message,
    data,
    requestId: meta.requestId,
    servedAt: meta.servedAt,
  };

  if (validationErrors && validationErrors.length > 0) {
    body.validationErrors = validationErrors;
  }

  res.status(statusCode).json(body);
};
