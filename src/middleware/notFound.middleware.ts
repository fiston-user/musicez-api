import { Request, Response, NextFunction } from 'express';

export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `The requested resource ${req.path} was not found`,
    },
    requestId: res.locals.requestId,
  });
}