import { describe, expect, test } from "bun:test";
import { setHeader, withResponse } from "./middleware";
import { json } from "./response";
import { createToad } from "./toad";

describe("json", () => {
  test("it returns a JSON response", async () => {
    const resp = await createToad()
      .get("/", (ctx) => json(ctx, { ok: true }))
      .handle(new Request("http://www.example.com"));

    expect(await resp.json<unknown>()).toEqual({ ok: true });
  });

  test("it includes response headers from context", async () => {
    const resp = await createToad()
      .use(withResponse())
      .use(setHeader(() => ["foo", "bar"]))
      .get("/", (ctx) => json(ctx, { ok: true }))
      .handle(new Request("http://www.example.com"));

    expect(resp.headers.get("foo")).toEqual("bar");
  });

  test("it accepts an HTTP status code", async () => {
    const resp = await createToad()
      .get("/", (ctx) => json(ctx, { ok: true }, 500))
      .handle(new Request("http://www.example.com"));

    expect(resp.status).toEqual(500);
  });

  test("it accepts a response init object", async () => {
    const resp = await createToad()
      .use(withResponse())
      .use(setHeader(() => ["foo", "bar"]))
      .get("/", (ctx) =>
        json(ctx, { ok: true }, { status: 500, headers: { foo: "baz" } })
      )
      .handle(new Request("http://www.example.com"));

    expect(resp.headers.get("foo")).toEqual("baz");
    expect(resp.status).toEqual(500);
  });
});
