import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Default to 500 if no status code
  const statusCode = error.statusCode || 500;
  
  // Log error for debugging
  console.error('Error:', {
    message: error.message,
    statusCode,
    code: error.code,
    path: req.path,
    method: req.method,
    requestId: res.locals.requestId,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.details : undefined,
    },
    requestId: res.locals.requestId,
  });
}