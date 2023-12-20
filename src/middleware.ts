import { type Simplify } from "type-fest";
import { BeforeCtx, Middleware, createMiddleware } from "./toad";

type WithResponseContext = {
  response: {
    headers: Headers;
  };
};

/**
 * Add (or override) a "response" key in local context that contains attributes
 * that can be used to construct the response. This currently only adds a {@link Headers}
 * value.
 *
 * @returns Middleware that adds empty response primitives.
 */
export function withResponse<O extends unknown>(): Middleware<
  O,
  Simplify<Omit<O, "response"> & WithResponseContext>
> {
  return createMiddleware((ctx) => ({ response: { headers: new Headers() } }));
}

type RequestIDContext = {
  requestID: string;
};

export function requestID<O extends unknown>(
  header = "request-id"
): Middleware<O, Simplify<Omit<O, keyof RequestIDContext> & RequestIDContext>> {
  return createMiddleware((ctx) => {
    const requestID = ctx.request.headers.get(header) ?? crypto.randomUUID();
    return { requestID };
  });
}

/**
 * Set a header on the response context's headers.
 *
 *     createToad()
 *       .use(withResponse())
 *       .use(requestID())
 *       .use(setHeader((ctx) => ["request-id", ctx.locals.requestID]))
 *
 * @param setter A function that receives the context and returns a tuple of a
 * header key and one or more header values (a string or array of strings).
 * @returns Middleware that sets a response header.
 */
export function setHeader<O extends WithResponseContext>(
  setter: (ctx: BeforeCtx<O>) => [string, string | string[]]
): Middleware<O, O> {
  return createMiddleware((ctx) => {
    const [key, value] = setter(ctx);

    if (Array.isArray(value)) {
      ctx.locals.response.headers.delete(key);
      value.forEach((v) => ctx.locals.response.headers.append(key, v));
    } else {
      ctx.locals.response.headers.set(key, value);
    }
    return {};
  });
}

/**
 * Append a header to the response context's headers.
 *
 * This differs from {@link setHeader} in that it will not override an existing
 * header with the same name.
 *
 *     createToad()
 *       .use(withResponse())
 *       .use(requestID())
 *       .use(appendHeader((ctx) => ["request-id", ctx.locals.requestID]))
 *
 * @param setter A function that receives the context and returns a tuple of a
 * header key and one or more header values (a string or array of strings).
 * @returns Middleware that sets a response header.
 */
export function appendHeader<O extends WithResponseContext>(
  setter: (ctx: BeforeCtx<O>) => [string, string | string[]]
): Middleware<O, O> {
  return createMiddleware((ctx) => {
    const [key, value] = setter(ctx);

    if (Array.isArray(value)) {
      value.forEach((v) => ctx.locals.response.headers.append(key, v));
    } else {
      ctx.locals.response.headers.append(key, value);
    }
    return {};
  });
}

/**
 * Use a function to handle errors thrown by middleware or request handlers.
 *
 * @param handler A handler called on an error that receives the context and the error.
 * @returns Middleware that calls the handler on an error.
 */
export function handleErrors<O extends unknown>(
  handler: (ctx: BeforeCtx<O>, err: unknown) => Response
): Middleware<O, O> {
  return async function errorHandler(ctx, next) {
    try {
      return await next(ctx.locals);
    } catch (error) {
      return handler(ctx, error);
    }
  };
}
