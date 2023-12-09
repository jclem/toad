import { expect, test } from "bun:test";
import { createMiddleware, createToad } from "./toad";

test("simple route", async () => {
  const resp = await createToad()
    .get("/", () => Response.json({ ok: true }))
    .handle(new Request("http://example.com"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ ok: true });
});

test("simple route with middleware", async () => {
  const resp = await createToad()
    .use((ctx, next) => next({ ok: true }))
    .get("/", (ctx) => Response.json(ctx.locals))
    .handle(new Request("http://example.com"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ ok: true });
});

test("calls middleware before the router", async () => {
  let called = false;

  const resp = await createToad()
    .use((ctx, next) => {
      called = true;
      return next(ctx);
    })
    .handle(new Request("http://example.com"));

  expect(called).toBe(true);
  expect(resp.status).toBe(404);
});

test("calls complex middleware in the correct order", async () => {
  const expected = ["pre-a", "pre-b", "pre-c", "post-c", "post-b", "post-a"];
  const actual: string[] = [];

  const resp = await createToad()
    .use((ctx, next) => {
      actual.push("pre-a");
      const resp = next({ ...ctx.locals, a: true });
      actual.push("post-a");
      return resp;
    })
    .use((ctx, next) => {
      actual.push("pre-b");
      const resp = next({ ...ctx.locals, b: true });
      actual.push("post-b");
      return resp;
    })
    .use((ctx, next) => {
      actual.push("pre-c");
      const resp = next({ ...ctx.locals, c: true });
      actual.push("post-c");
      return resp;
    })
    .get("/", (ctx) => Response.json(ctx.locals))
    .handle(new Request("http://example.com"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: true, b: true, c: true });
  expect(actual).toEqual(expected);
});

test("createMiddleware merges locals", async () => {
  const resp = await createToad()
    .use(createMiddleware(() => ({ foo: "bar" })))
    .use(createMiddleware(() => ({ baz: "qux" })))
    .get("/", (ctx) => Response.json(ctx.locals))
    .handle(new Request("http://example.com"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ foo: "bar", baz: "qux" });
});

test("createMiddleware ignores non-return values", async () => {
  const resp = await createToad()
    .use(createMiddleware(() => ({ foo: "bar" })))
    .use(createMiddleware(() => {}))
    .use(createMiddleware((ctx) => ({ baz: "qux" })))
    .get("/", (ctx) => Response.json(ctx.locals))
    .handle(new Request("http://example.com"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ foo: "bar", baz: "qux" });
});

test("handles async middleware and handlers", async () => {
  const wait = () => new Promise((r) => setTimeout(r, 1));

  const resp = await createToad()
    .use(
      createMiddleware(async (ctx) => {
        await wait();
        return { a: true };
      })
    )
    .use(
      createMiddleware(async (ctx) => {
        await wait();
        return { b: true };
      })
    )
    .get("/", async (ctx) => {
      await wait();
      return Response.json(ctx.locals);
    })
    .handle(new Request("http://example.com"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: true, b: true });
});

test("handles path parameters", async () => {
  const resp = await createToad()
    .get("/foo/:a/:b", (ctx) =>
      Response.json({ a: ctx.parameters.a, b: ctx.parameters.b })
    )
    .handle(new Request("http://example.com/foo/aa/bb"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: "aa", b: "bb" });
});

test("handles wildcard parameters", async () => {
  const resp = await createToad()
    .get("/foo/:bar/*", (ctx) => Response.json(ctx.parameters))
    .handle(new Request("http://example.com/foo/bar/aa/bb"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ bar: "bar", "*": "aa/bb" });
});

test("includes matched route in context", async () => {
  const resp = await createToad()
    .get("/foo/:bar", (ctx) => new Response(ctx.matchedRoute))
    .handle(new Request("http://example.com/foo/bar"));

  expect(resp.status).toBe(200);
  expect(await resp.text()).toBe("/foo/:bar");
});

test("supports sub-routers", async () => {
  const toad = createToad()
    .use(createMiddleware(() => ({ a: 1 })))
    .route("/foo", (t) =>
      t
        .use(createMiddleware(() => ({ b: 2 })))
        .get("/", (ctx) => Response.json(ctx.locals))
        .route("/bar", (t) =>
          t
            .use(createMiddleware(() => ({ c: 3 })))
            .get("/", (ctx) => Response.json(ctx.locals))
        )
    )
    .get("/", (ctx) => Response.json(ctx.locals));

  let resp = await toad.handle(new Request("http://example.com"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: 1 });

  resp = await toad.handle(new Request("http://example.com/foo"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: 1, b: 2 });

  resp = await toad.handle(new Request("http://example.com/foo/bar"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: 1, b: 2, c: 3 });
});

test("supports complex nested sub-routers", async () => {
  const toad = createToad()
    .use(createMiddleware(() => ({ a: 1 })))
    .use(createMiddleware(() => ({})))
    .use(createMiddleware(() => ({ b: 2 })))
    .get("/", (ctx) => Response.json(ctx.locals))
    .get("/foo/:bar", (ctx) =>
      Response.json({ locals: ctx.locals, params: ctx.parameters })
    )
    .route("/:baz", (t) => {
      t.use(createMiddleware(() => ({ c: 1 })))
        .use(createMiddleware(() => ({})))
        .use(createMiddleware(() => ({ d: 2 })))
        .get("/qux/:quux", (ctx) =>
          Response.json({ locals: ctx.locals, params: ctx.parameters })
        )
        .route("/:corge/:grault", (t) => {
          t.use(createMiddleware(() => ({ e: 1 })))
            .use(createMiddleware(() => ({})))
            .use(createMiddleware(() => ({ f: 2 })))
            .get("/garply/:waldo", (ctx) =>
              Response.json({ locals: ctx.locals, params: ctx.parameters })
            );
        });
    });

  let resp = await toad.handle(new Request("http://example.com"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ a: 1, b: 2 });

  resp = await toad.handle(new Request("http://example.com/foo/bar"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({
    locals: { a: 1, b: 2 },
    params: { bar: "bar" },
  });

  resp = await toad.handle(new Request("http://example.com/baz/qux/quux"));
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({
    locals: { a: 1, b: 2, c: 1, d: 2 },
    params: { baz: "baz", quux: "quux" },
  });

  resp = await toad.handle(
    new Request("http://example.com/baz/corge/grault/garply/waldo")
  );
  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({
    locals: { a: 1, b: 2, c: 1, d: 2, e: 1, f: 2 },
    params: { baz: "baz", corge: "corge", grault: "grault", waldo: "waldo" },
  });
});
