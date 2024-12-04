import { describe, expect, test } from "bun:test";
import { expectType } from "ts-expect";
import {
  appendHeader,
  handleErrors,
  requestID,
  setHeader,
  withResponse,
} from "./middleware";
import { BeforeCtx, createMiddleware, createRouter } from "./router";

describe("withResponse", () => {
  test("adds empty response parameters", async () => {
    await createRouter()
      .use(createMiddleware(() => ({ ok: true })))
      .use(withResponse())
      .get("/", (ctx) => {
        expectType<boolean>(ctx.locals.ok);
        expectType<Headers>(ctx.locals.response.headers);
        return new Response("ok");
      })
      .handle(new Request("http://www.example.com"));
  });
});

describe("requestID", () => {
  test("should create a request ID by default", async () => {
    // Until bun:test supports "expect.assertions".
    let ran = false;

    await createRouter()
      .use(requestID())
      .get("/", (ctx) => {
        expectType<string>(ctx.locals.requestID);
        expect(ctx.locals.requestID).toBeString();
        ran = true;
        return new Response("ok");
      })
      .handle(new Request("http://www.example.com"));

    expect(ran).toBeTrue();
  });
});

describe("setHeader", () => {
  test("it assigns a response header", async () => {
    const resp = await createRouter()
      .use(withResponse())
      .use(requestID())
      .use(setHeader((ctx) => ["request-id", ctx.locals.requestID]))
      .get("/", (ctx) => {
        return new Response("ok", { headers: ctx.locals.response.headers });
      })
      .handle(new Request("http://www.example.com"));

    expect(resp.headers.get("request-id")).toBeString();
  });
});

describe("appendHeader", () => {
  test("it appends a response header", async () => {
    const resp = await createRouter()
      .use(withResponse())
      .use(appendHeader((ctx) => ["foo", "bar"]))
      .use(appendHeader((ctx) => ["foo", ["baz", "qux"]]))
      .use(appendHeader((ctx) => ["foo", "quux"]))
      .get("/", (ctx) => {
        return new Response("ok", { headers: ctx.locals.response.headers });
      })
      .handle(new Request("http://www.example.com"));

    expect(resp.headers.get("foo")).toEqual("bar, baz, qux, quux");
  });
});

describe("handleErrors", () => {
  test("it handles errors", async () => {
    function onError(ctx: BeforeCtx<unknown, unknown>, err: unknown) {
      expect(err).toBeInstanceOf(Error);
      return new Response("ok");
    }

    const resp = await createRouter()
      .use(handleErrors(onError))
      .get("/", () => {
        throw new Error("oops");
      })
      .handle(new Request("http://www.example.com"));

    expect(resp.status).toEqual(200);
    expect(await resp.text()).toEqual("ok");
  });
});
