import Memoirist from "memoirist";

export type Next<O> = (out: Readonly<O>) => Awaitable<Response>;

type Awaitable<T> = T | Promise<T>;
type Md<I, O extends Record<string, unknown>> = (
  ctx: BeforeCtx<I>,
  next: Next<Readonly<O>>
) => Awaitable<Response>;
type Handler<L, P> = (ctx: RequestCtx<L, P>) => Awaitable<Response>;

type ExtractParam<Path, NextPart> = Path extends `:${infer Param}`
  ? Record<Param, string> & NextPart
  : Path extends "*"
  ? Record<"*", string> & NextPart
  : NextPart;

type ExtractParams<Path> = Path extends `${infer Segment}/${infer Rest}`
  ? ExtractParam<Segment, ExtractParams<Rest>>
  : ExtractParam<Path, {}>;

/**
 * The context passed to a middleware
 */
export type BeforeCtx<L> = Readonly<{
  /** The request currently being handled */
  request: Request;
  /** The route pattern that the request matched (if there was a match) */
  matchedRoute: string | null;
  /** Request-scoped immutable local values */
  locals: Readonly<L>;
}>;

/**
 * The context passed to a request handler
 */
export type RequestCtx<L, P> = Readonly<{
  /** The request currently being handled */
  request: Readonly<Request>;
  /** The route pattern that the request matched (if there was a match) */
  matchedRoute: string;
  /** Request-scoped immutable local values */
  locals: Readonly<L>;
  /** The response to the request */
  parameters: Readonly<P>;
}>;

/**
 * Create a new Toad instance.
 *
 * @returns A new Toad instance.
 */
export function createToad() {
  return new Toad<"", {}>("");
}

type RouterCtx<O extends Record<string, unknown>> = {
  matchingRoute: string;
  stack: Md<Record<string, unknown>, Record<string, unknown>>[];
  handler: Handler<O, ExtractParams<unknown>>;
};

type Router<O extends Record<string, unknown>> = Memoirist<RouterCtx<O>>;

class Toad<BasePath extends string, O extends Record<string, unknown>> {
  #basePath: BasePath;
  #stack: Md<unknown, Record<string, unknown>>[];
  #router: Router<O> = new Memoirist();

  constructor(
    basePath: BasePath,
    stack: Md<unknown, Record<string, unknown>>[] = [],
    router: Router<O> = new Memoirist()
  ) {
    this.#basePath = basePath;
    this.#stack = stack;
    this.#router = router;
  }

  use<OO extends Record<string, unknown>>(md: Md<O, OO>): Toad<BasePath, OO> {
    // NOTE: These type casts happen, because we know that in our handler, we're
    // calling these middleware functions in a chain, starting with an empty
    // input (`{}`).
    this.#stack.push(md as Md<unknown, Record<string, unknown>>);
    return this as unknown as Toad<BasePath, OO>;
  }

  get<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("GET", path, fn);
    return this;
  }

  post<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("POST", path, fn);
    return this;
  }

  put<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("PUT", path, fn);
    return this;
  }

  patch<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("PATCH", path, fn);
    return this;
  }

  delete<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("DELETE", path, fn);
    return this;
  }

  connect<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("CONNECT", path, fn);
    return this;
  }

  options<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("OPTIONS", path, fn);
    return this;
  }

  trace<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<BasePath, O> {
    this.#addRoute("TRACE", path, fn);
    return this;
  }

  #addRoute<P extends string>(
    method: string,
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ) {
    // This type cast is valid because we know that we will only call this
    // handler when the router matches it.
    this.#router.add(method, this.#basePath + path, {
      matchingRoute: path,
      stack: this.#stack,
      handler: fn as Handler<O, ExtractParams<unknown>>,
    });
  }

  route<P extends string>(
    path: P,
    fn: (toad: Toad<`${BasePath}${P}`, Record<string, unknown>>) => void
  ): this {
    fn(
      new Toad(
        `${this.#basePath}${path}`,
        [...this.#stack],
        this.#router as Router<Record<string, unknown>>
      )
    );
    return this;
  }

  handle(request: Request): Awaitable<Response> {
    const path = "/" + request.url.split("/").slice(3).join("/");
    const handler = this.#router.find(request.method, path);

    let ctx: BeforeCtx<{}> = {
      request,
      matchedRoute: handler?.store.matchingRoute ?? null,
      locals: {},
    };

    if (!handler) {
      return Response.json({ message: "Not found" }, { status: 404 });
    }

    // Iterate the stack one-by-one, feeding the output of the last stack item
    // as the input of the next stack item (re-wrapped in a new context).
    //
    // When we reach the end of the stack, we invoke the handler function.
    let i = 0;
    const next = (out: Readonly<unknown>): Awaitable<Response> => {
      if (i >= handler.store.stack.length) {
        return handler.store.handler({
          ...ctx,
          matchedRoute: handler.store.matchingRoute,
          locals: out as O,
          parameters: handler.params,
        });
      }

      const md = handler.store.stack[i++];
      return md({ ...ctx, locals: out }, next);
    };

    return next({});
  }
}

/**
 * Create a piece of middleware for use in a Toad router.
 *
 * This is a convenience function for creating middleware while requiring
 * minimal manual defining of generics.
 *
 * The function takes two parameters: `before` and an optional `after` function.
 *
 * The `before` function runs before the request handler runs, and its return
 * value will be merged into the request context locals ({@link BeforeCtx.locals}).
 *
 * The `after` function runs after the request handler runs, and is passed the
 * request context and the response object. This is useful for logging, for
 * example. The local values returned by the `before` will be included in the
 * context passed to `after`.
 *
 * ## Example
 *
 * This example server will return `{ foo: "bar", baz: "qux" }` when a client
 * GETs "/".
 *
 *     createToad()
 *       .use(createMiddleware(() => ({ foo: "bar" })))
 *       .use(createMiddleware(() => ({ baz: "qux" })))
 *       .get("/", (ctx) => Response.json(ctx.locals))
 *       .handle(new Request("http://example.com"))
 *
 * @param before The function to run before the request handler
 * @param after The function to run after the request handler
 * @returns A piece of middleware for use in a Toad router
 */
export function createMiddleware<
  I extends Record<string, unknown>,
  O extends Record<string, unknown>
>(
  before: (ctx: BeforeCtx<I>) => Awaitable<O>,
  after?: (ctx: BeforeCtx<I & O>, resp: Response) => Awaitable<void>
): Md<I, I & O>;
export function createMiddleware<I extends Record<string, unknown>>(
  before: (ctx: BeforeCtx<I>) => void,
  after?: (ctx: BeforeCtx<I>, resp: Response) => Awaitable<void>
): Md<I, I>;
export function createMiddleware<
  I extends Record<string, unknown>,
  O extends Record<string, unknown>
>(
  before: (ctx: BeforeCtx<I>) => Awaitable<O>,
  after?: (ctx: BeforeCtx<I & O>, resp: Response) => Awaitable<void>
): Md<I, I & O> {
  return async (ctx: BeforeCtx<I>, next: Next<I & O>) => {
    const o = await before(ctx);
    const newCtx = { ...ctx, locals: { ...ctx.locals, ...o } };
    const resp = await next(newCtx.locals);
    if (after) await after(newCtx, resp);
    return resp;
  };
}
