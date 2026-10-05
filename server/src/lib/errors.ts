import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@bitquiz/shared';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, ERROR_CODES.VALIDATION, message, details);
export const unauthorized = (message = 'Please log in') => new HttpError(401, ERROR_CODES.UNAUTHORIZED, message);
export const forbidden = (message = 'You are not allowed to do that') =>
  new HttpError(403, ERROR_CODES.FORBIDDEN, message);
export const notFound = (what = 'Resource') => new HttpError(404, ERROR_CODES.NOT_FOUND, `${what} not found`);
export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new HttpError(409, code, message, details);

/** Parses input with a Zod schema, turning failures into a 400 with field-level details. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw zodToHttp(result.error);
  return result.data;
}

function zodToHttp(error: ZodError): HttpError {
  const fields = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return badRequest(fields[0]?.message ?? 'Invalid input', { fields });
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound('Route'));

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let httpError: HttpError;
  if (err instanceof HttpError) {
    httpError = err;
  } else if (err instanceof ZodError) {
    httpError = zodToHttp(err);
  } else if (err?.type === 'entity.parse.failed') {
    httpError = badRequest('Malformed JSON body');
  } else if (err?.type === 'entity.too.large') {
    httpError = new HttpError(413, ERROR_CODES.VALIDATION, 'Request body is too large');
  } else {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
    httpError = new HttpError(500, ERROR_CODES.INTERNAL, 'Something went wrong. Please try again.');
  }
  const body: ApiErrorBody = {
    error: { code: httpError.code, message: httpError.message, details: httpError.details },
  };
  res.status(httpError.status).json(body);
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a route id parameter; malformed ids are reported as not found. */
export function idParam(value: unknown, what: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw notFound(what);
  return value;
}
