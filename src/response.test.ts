import { describe, expect, test } from "bun:test";
import { setHeader, withResponse } from "./middleware";
import { json } from "./response";
import { createRouter } from "./router";

describe("json", () => {
  test("it returns a JSON response", async () => {
    const resp = await createRouter()
      .get("/", (ctx) => json(ctx, { ok: true }))
      .handle(new Request("http://www.example.com"));

    expect(await resp.json<unknown>()).toEqual({ ok: true });
  });

  test("it includes response headers from context", async () => {
    const resp = await createRouter()
      .use(withResponse())
      .use(setHeader(() => ["foo", "bar"]))
      .get("/", (ctx) => json(ctx, { ok: true }))
      .handle(new Request("http://www.example.com"));

    expect(resp.headers.get("foo")).toEqual("bar");
  });

  test("it accepts an HTTP status code", async () => {
    const resp = await createRouter()
      .get("/", (ctx) => json(ctx, { ok: true }, 500))
      .handle(new Request("http://www.example.com"));

    expect(resp.status).toEqual(500);
  });

  test("it accepts a response init object", async () => {
    const resp = await createRouter()
      .use(withResponse())
      .use(setHeader(() => ["foo", "bar"]))
      .get("/", (ctx) =>
        json(ctx, { ok: true }, { status: 500, headers: { foo: "baz" } }),
      )
      .handle(new Request("http://www.example.com"));

    expect(resp.headers.get("foo")).toEqual("baz");
    expect(resp.status).toEqual(500);
  });

  test("it works in middleware", async () => {
    const resp = await createRouter()
      .use(withResponse())
      .use(setHeader(() => ["foo", "bar"]))
      .use((ctx) => json(ctx, { ok: false }, 500))
      .get("/", (ctx) => json(ctx, { ok: true }))
      .handle(new Request("http://www.example.com"));

    expect(resp.headers.get("foo")).toEqual("bar");
    expect(await resp.json<unknown>()).toEqual({ ok: false });
  });
});
