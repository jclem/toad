import { expect, test } from "bun:test";
import { Middleware, createMiddleware, createRouter } from "./src/router";

/*
 * To handle errors, create middleware which wraps the remaining stack in a
 * try/catch.
 */
test("error handling middleware", async () => {
  function onError<I extends Record<string, unknown>, P>(): Middleware<
    I,
    I,
    P
  > {
    return async (ctx, next) => {
      try {
        return await next(ctx.locals);
      } catch (value) {
        return Response.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      }
    };
  }

  const router = createRouter()
    .use(onError())
    .get("/", () => {
      throw new Error("Boom");
    });

  const resp = await router.handle(new Request("http://example.com"));
  expect(resp.status).toBe(500);
  expect(await resp.json<unknown>()).toEqual({
    error: "Internal server error",
  });
});

/*
 * To halt the request pipeline and avoid the handler being called, don't call
 * `next` and then return a response.
 */
test("halting request pipeline", async () => {
  const router = createRouter()
    .use(createMiddleware(() => ({ username: "banned" })))
    .use((ctx, next) => {
      if (ctx.locals.username === "banned") {
        return Response.json({ error: "You are banned" }, { status: 403 });
      }

      return next(ctx.locals);
    })
    .get("/", () => Response.json({ ok: true }));

  const resp = await router.handle(new Request("http://example.com"));
  expect(resp.status).toBe(403);
  expect(await resp.json<unknown>()).toEqual({ error: "You are banned" });
});

/*
 * This example uses all features of Router.
 */
test("kitchen sink", async () => {
  const router = createRouter()
    .use(createMiddleware(() => ({ a: 1 })))
    .use(createMiddleware(() => ({})))
    .use(createMiddleware(() => ({ b: 2 })))
    .get("/", (ctx) => Response.json(ctx.locals))
    .get("/foo/:bar", (ctx) =>
      Response.json({ locals: ctx.locals, params: ctx.parameters }),
    )
    .route("/:baz", (t) => {
      t.use(createMiddleware(() => ({ c: 1 })))
        .use(createMiddleware(() => ({})))
        .use(createMiddleware(() => ({ d: 2 })))
        .get("/qux/:quux", (ctx) =>
          Response.json({ locals: ctx.locals, params: ctx.parameters }),
        )
        .route("/:corge/:grault", (t) => {
          t.use(createMiddleware(() => ({ e: 1 })))
            .use(createMiddleware(() => ({})))
            .use(createMiddleware(() => ({ f: 2 })))
            .get("/garply/:waldo", (ctx) =>
              Response.json({ locals: ctx.locals, params: ctx.parameters }),
            );
        });
    });

  let resp = await router.handle(new Request("http://example.com"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: 1, b: 2 });

  resp = await router.handle(new Request("http://example.com/foo/bar"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({
    locals: { a: 1, b: 2 },
    params: { bar: "bar" },
  });

  resp = await router.handle(new Request("http://example.com/baz/qux/quux"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({
    locals: { a: 1, b: 2, c: 1, d: 2 },
    params: { baz: "baz", quux: "quux" },
  });

  resp = await router.handle(
    new Request("http://example.com/baz/corge/grault/garply/waldo"),
  );
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({
    locals: { a: 1, b: 2, c: 1, d: 2, e: 1, f: 2 },
    params: { baz: "baz", corge: "corge", grault: "grault", waldo: "waldo" },
  });
});
