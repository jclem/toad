import { expect, test } from "bun:test";
import { createMiddleware, createToad } from "./src/toad";

/*
 * To handle errors, create middleware which wraps the remaining stack in a
 * try/catch.
 */
test("error handling middleware", async () => {
  const toad = createToad()
    .use((ctx, next) => {
      try {
        return next(ctx);
      } catch (value) {
        // console.log("caught error", value);
        return Response.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    })
    .get("/", () => {
      throw new Error("Boom");
    });

  const resp = await toad.handle(new Request("http://example.com"));
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
  const toad = createToad()
    .use(createMiddleware(() => ({ username: "banned" })))
    .use((ctx, next) => {
      if (ctx.locals.username === "banned") {
        return Response.json({ error: "You are banned" }, { status: 403 });
      }

      return next(ctx);
    })
    .get("/", () => Response.json({ ok: true }));

  const resp = await toad.handle(new Request("http://example.com"));
  expect(resp.status).toBe(403);
  expect(await resp.json<unknown>()).toEqual({ error: "You are banned" });
});
