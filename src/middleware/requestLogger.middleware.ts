import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../config/utils/logger';

const logger = createLogger('backend.server.request');

/** Mark that we already logged the response (in res.json wrapper) to avoid double log on finish */
const RESPONSE_LOGGED = Symbol('responseLogged');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();

    logger.separator();
    logger.info(`Received request → ${req.method} ${req.url}`);

    if (req.body && Object.keys(req.body).length > 0) {
        logger.debug('Request body:', req.body);
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
        (res as unknown as { [RESPONSE_LOGGED]?: boolean })[RESPONSE_LOGGED] = true;
        const duration = Date.now() - startTime;
        logger.info(`Response sent ← ${res.statusCode} (${duration}ms)`);
        if (body) {
            logger.debug('Response body:', body);
        }
        logger.separator();
        return originalJson(body);
    };

    res.on('finish', () => {
        if ((res as unknown as { [RESPONSE_LOGGED]?: boolean })[RESPONSE_LOGGED]) {
            return;
        }
        const duration = Date.now() - startTime;
        logger.info(`Response sent ← ${res.statusCode} (${duration}ms)`);
        logger.separator();
    });

    next();
}
