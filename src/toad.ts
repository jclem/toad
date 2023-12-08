import Memoirist from "memoirist";

type Awaitable<T> = T | Promise<T>;
type Md<I, O> = (
  ctx: BeforeCtx<I>,
  next: MdNext<Readonly<O>>
) => Awaitable<Response>;
type MdNext<O> = (out: O) => Awaitable<Response>;
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
  request: Readonly<Request>;
  /** Request-scoped immutable local values */
  locals: Readonly<L>;
}>;

/**
 * The context passed to a request handler
 */
export type RequestCtx<L, P> = Readonly<{
  /** The request currently being handled */
  request: Readonly<Request>;
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
  return new Toad<{}>();
}

class Toad<O> {
  #stack: Md<unknown, unknown>[] = [];
  #router: Memoirist<Handler<O, ExtractParams<unknown>>> = new Memoirist();

  use<OO>(md: Md<O, OO>): Toad<OO> {
    // NOTE: These type casts happen, because we know that in our handler, we're
    // calling these middleware functions in a chain, starting with an empty
    // input (`{}`).
    this.#stack.push(md as Md<unknown, unknown>);
    return this as unknown as Toad<OO>;
  }

  get<P extends string>(path: P, fn: Handler<O, ExtractParams<P>>): Toad<O> {
    this.#addRoute("GET", path, fn);
    return this;
  }

  post<P extends string>(path: P, fn: Handler<O, ExtractParams<P>>): Toad<O> {
    this.#addRoute("POST", path, fn);
    return this;
  }

  put<P extends string>(path: P, fn: Handler<O, ExtractParams<P>>): Toad<O> {
    this.#addRoute("PUT", path, fn);
    return this;
  }

  patch<P extends string>(path: P, fn: Handler<O, ExtractParams<P>>): Toad<O> {
    this.#addRoute("PATCH", path, fn);
    return this;
  }

  delete<P extends string>(path: P, fn: Handler<O, ExtractParams<P>>): Toad<O> {
    this.#addRoute("DELETE", path, fn);
    return this;
  }

  connect<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<O> {
    this.#addRoute("CONNECT", path, fn);
    return this;
  }

  options<P extends string>(
    path: P,
    fn: Handler<O, ExtractParams<P>>
  ): Toad<O> {
    this.#addRoute("OPTIONS", path, fn);
    return this;
  }

  trace<P extends string>(path: P, fn: Handler<O, ExtractParams<P>>): Toad<O> {
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
    this.#router.add(method, path, fn as Handler<O, ExtractParams<unknown>>);
  }

  handle(request: Request): Awaitable<Response> {
    const path = "/" + request.url.split("/").slice(3).join("/");
    const handler = this.#router.find(request.method, path);

    let ctx: BeforeCtx<{}> = {
      request,
      locals: {},
    };

    // Iterate the stack one-by-one, feeding the output of the last stack item
    // as the input of the next stack item (re-wrapped in a new context).
    //
    // When we reach the end of the stack, we invoke the handler function.
    let i = 0;
    const next = (out: Readonly<unknown>): Awaitable<Response> => {
      if (i >= this.#stack.length) {
        if (!handler) {
          return Response.json({ message: "Not found" }, { status: 404 });
        }

        return handler.store({
          ...ctx,
          locals: out as O,
          parameters: handler.params,
        });
      }

      const md = this.#stack[i++];
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
export function createMiddleware<I, O>(
  before: (ctx: BeforeCtx<I>) => Awaitable<Readonly<O>>,
  after?: (ctx: BeforeCtx<O>, resp: Response) => Awaitable<void>
): Md<I, I & O> {
  return async (ctx: BeforeCtx<I>, next: MdNext<I & O>) => {
    const o = await before(ctx);
    const newCtx = { ...ctx, locals: { ...ctx.locals, ...o } };
    const resp = await next(newCtx.locals);
    if (after) await after(newCtx, resp);
    return resp;
  };
}
