import { describe, expect, mock, test } from "bun:test";
import type { TypeEqual } from "ts-expect";
import { expectType } from "ts-expect";
import { Middleware, Output, createMiddleware, createToad } from "./toad";

test("simple route", async () => {
  const resp = await createToad()
    .get("/", () => Response.json({ ok: true }))
    .handle(new Request("http://example.com"));

  expect(resp.status).toBe(200);
  expect(await resp.json<unknown>()).toEqual({ ok: true });
});

describe("middleware", () => {
  test("before", async () => {
    const resp = await createToad()
      .use(createMiddleware(() => ({ ok: true })))
      .get("/", (ctx) => {
        expectType<{ ok: boolean }>(ctx.locals);
        return Response.json(ctx.locals);
      })
      .handle(new Request("http://example.com"));

    expect(resp.status).toBe(200);
    expect(await resp.json<unknown>()).toEqual({ ok: true });
  });

  test("before stack", async () => {
    const resp = await createToad()
      .use(createMiddleware(() => ({ a: true })))
      .use(
        createMiddleware((ctx) => {
          expectType<{ a: boolean }>(ctx.locals);
          return { b: true };
        })
      )
      .get("/", (ctx) => {
        expectType<{ a: boolean; b: boolean }>(ctx.locals);
        return Response.json(ctx.locals);
      })
      .handle(new Request("http://example.com"));

    expect(resp.status).toBe(200);
    expect(await resp.json<unknown>()).toEqual({ a: true, b: true });
  });

  test("before ignores non-return values", async () => {
    const resp = await createToad()
      .use(createMiddleware(() => ({ foo: "bar" })))
      .use(createMiddleware(() => {}))
      .use(createMiddleware(() => ({ baz: "qux" })))
      .get("/", (ctx) => {
        expectType<{ foo: string; baz: string }>(ctx.locals);
        return Response.json(ctx.locals);
      })
      .handle(new Request("http://example.com"));

    expect(resp.status).toBe(200);
    expect(await resp.json<unknown>()).toEqual({ foo: "bar", baz: "qux" });
  });

  test("after", async () => {
    const after = mock(() => {});

    await createToad()
      .use(createMiddleware(() => ({ ok: true }), after))
      .get("/", (ctx) => {
        expectType<{ ok: boolean }>(ctx.locals);
        return Response.json(ctx.locals);
      })
      .handle(new Request("http://example.com"));

    expect(after).toHaveBeenCalledTimes(1);
  });

  test("around", async () => {
    function onError<I>(): Middleware<I, I & { ok: boolean }> {
      return function (ctx, next) {
        try {
          return next({ ...ctx.locals, ok: false });
        } catch (err) {
          return Response.json({ error: err });
        }
      };
    }

    const resp = await createToad()
      .use(createMiddleware(() => ({ foo: "bar" })))
      .use(onError())
      .get("/", (ctx) => {
        expectType<{ foo: String; ok: boolean }>(ctx.locals);
        return Response.json(ctx.locals);
      })
      .handle(new Request("http://example.com"));

    expect(resp.status).toBe(200);
    expect(await resp.json<unknown>()).toEqual({ foo: "bar", ok: false });
  });

  test("runs before the router", async () => {
    let called = false;

    const resp = await createToad()
      .use((ctx, next) => {
        called = true;
        return next(ctx.locals);
      })
      .handle(new Request("http://example.com"));

    expect(called).toBe(true);
    expect(resp.status).toBe(404);
  });

  test("runs in the correct order", async () => {
    const expected = ["pre-a", "pre-b", "pre-c", "post-c", "post-b", "post-a"];
    const actual: string[] = [];

    const resp = await createToad()
      .use((ctx, next) => {
        actual.push("pre-a");
        const resp = next({ a: true });
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

  test("doesn't affect earlier routes", async () => {
    const resp = await createToad()
      .get("/", (ctx) => {
        expectType<{}>(ctx.locals);
        return Response.json(ctx.locals);
      })
      .use(createMiddleware(() => ({ foo: "bar" })))
      .handle(new Request("http://example.com"));

    expect(resp.status).toBe(200);
    expect(await resp.json<unknown>()).toEqual({});
  });
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
      expectType<{ a: boolean; b: boolean }>(ctx.locals);
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
    .get("/foo/:bar", (ctx) => {
      expectType<{ a: number; b: number }>(ctx.locals);
      return Response.json({ locals: ctx.locals, params: ctx.parameters });
    })
    .route("/:baz", (t) => {
      t.use(createMiddleware(() => ({ c: 1 })))
        .use(createMiddleware(() => ({})))
        .use(createMiddleware(() => ({ d: 2 })))
        .get("/qux/:quux", (ctx) => {
          expectType<{ a: number; b: number; c: number; d: number }>(
            ctx.locals
          );
          return Response.json({ locals: ctx.locals, params: ctx.parameters });
        })
        .route("/:corge/:grault", (t) => {
          t.use(createMiddleware(() => ({ e: 1 })))
            .use(createMiddleware(() => ({})))
            .use(createMiddleware(() => ({ f: 2 })))
            .get("/garply/:waldo", (ctx) => {
              expectType<{
                a: number;
                b: number;
                c: number;
                d: number;
                e: number;
                f: number;
              }>(ctx.locals);
              return Response.json({
                locals: ctx.locals,
                params: ctx.parameters,
              });
            });
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

test("output type", () => {
  const requestID = createMiddleware(() => ({ requestID: "abc" }));
  expectType<TypeEqual<Output<typeof requestID>, { requestID: string }>>(true);
});
