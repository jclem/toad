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
