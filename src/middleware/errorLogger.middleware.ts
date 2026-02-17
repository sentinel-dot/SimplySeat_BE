import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../config/utils/logger';

const logger = createLogger('backend.server.error');

export function errorLogger(err: Error, req: Request, res: Response, _next: NextFunction): void {
    logger.error(`Error on ${req.method} ${req.url}`, {
        error: err.message,
        stack: err.stack,
    });

    res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
}
