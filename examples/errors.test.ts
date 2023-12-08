import { expect, test } from "bun:test";
import { createToad } from "../src/toad";

test("error handling middleware", async () => {
  const toad = createToad()
    .use((ctx, next) => {
      try {
        return next(ctx);
      } catch (value) {
        const err =
          value instanceof Error ? value.message : new Error(String(value));
        return Response.json({ error: err }, { status: 500 });
      }
    })
    .get("/", () => {
      throw new Error("Boom");
    });

  const resp = await toad.handle(new Request("http://example.com"));
  expect(resp.status).toBe(500);
  expect(await resp.json<unknown>()).toEqual({ error: "Boom" });
});
