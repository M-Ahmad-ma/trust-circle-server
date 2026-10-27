import type { NextFunction, Request, Response } from 'express';
import type { z, ZodTypeAny } from 'zod';

/** Validate and replace req.body. (Query is validated in handlers via parse() —
 *  Express 5 exposes req.query as a getter and it cannot be reassigned.) */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Parse/validate any request payload; ZodError propagates to the error handler. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data) as z.infer<S>;
}
