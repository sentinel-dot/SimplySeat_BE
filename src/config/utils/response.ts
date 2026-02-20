import { Response } from 'express';
import type { ApiResponse } from './types';

/**
 * Send a success JSON response.
 */
export function sendSuccess<T>(res: Response, data: T, message?: string): void {
    res.json({
        success: true,
        ...(message && { message }),
        data,
    } as ApiResponse<T>);
}

/**
 * Send an error JSON response. In development, includes error detail.
 */
export function sendError(
    res: Response,
    status: number,
    message: string,
    err?: unknown
): void {
    res.status(status).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' && err !== undefined ? String(err) : undefined,
    } as ApiResponse<void>);
}
