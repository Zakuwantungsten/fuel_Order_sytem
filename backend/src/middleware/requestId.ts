import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export interface RequestWithId extends Request {
  requestId?: string;
}

export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.headers['x-request-id'];
  const headerId = typeof incoming === 'string' ? incoming.trim() : '';
  const id = headerId.length > 0 ? headerId : randomUUID();

  (req as RequestWithId).requestId = id;
  res.setHeader('x-request-id', id);

  next();
};
