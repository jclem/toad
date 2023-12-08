import Memoirist from "memoirist";

type Awaitable<T> = T | Promise<T>;
type Md<I, O> = (
  ctx: RequestCtx<I>,
  next: MdNext<Readonly<O>>
) => Awaitable<Response>;
type MdNext<O> = (out: O) => Awaitable<Response>;
type Handler<T> = (ctx: RequestCtx<T>) => Awaitable<Response>;

/**
 * The context passed to a middleware or request handler
 */
export type RequestCtx<L> = Readonly<{
  /** The request currently being handled */
  request: Readonly<Request>;
  /** Request-scoped immutable local values */
  locals: Readonly<L>;
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
  #router: Memoirist<Handler<O>> = new Memoirist();

  use<OO>(md: Md<O, OO>): Toad<OO> {
    // NOTE: These type casts happen, because we know that in our handler, we're
    // calling these middleware functions in a chain, starting with an empty
    // input (`{}`).
    this.#stack.push(md as Md<unknown, unknown>);
    return this as unknown as Toad<OO>;
  }

  get(path: string, fn: Handler<O>): Toad<O> {
    this.#router.add("GET", path, fn);
    return this;
  }

  handle(request: Request): Awaitable<Response> {
    const path = "/" + request.url.split("/").slice(3).join("/");
    const handler = this.#router.find(request.method, path);

    let ctx: RequestCtx<{}> = {
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

        return handler.store({ ...ctx, locals: out as O });
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
 * value will be merged into the request context locals ({@link RequestCtx.locals}).
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
  before: (ctx: RequestCtx<I>) => Awaitable<Readonly<O>>,
  after?: (ctx: RequestCtx<O>, resp: Response) => Awaitable<void>
): Md<I, I & O> {
  return async (ctx: RequestCtx<I>, next: MdNext<I & O>) => {
    const o = await before(ctx);
    const newCtx = { ...ctx, locals: { ...ctx.locals, ...o } };
    const resp = await next(newCtx.locals);
    if (after) await after(newCtx, resp);
    return resp;
  };
}
