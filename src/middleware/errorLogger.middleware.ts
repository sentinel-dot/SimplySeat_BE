import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../config/utils/logger';
import { sendError } from '../config/utils/response';

const logger = createLogger('backend.server.error');

export function errorLogger(err: Error, req: Request, res: Response, _next: NextFunction): void {
    logger.error(`Error on ${req.method} ${req.url}`, {
        error: err.message,
        stack: err.stack,
    });

    sendError(res, 500, 'Internal Server Error', err);
}
