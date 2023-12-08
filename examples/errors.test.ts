import { expect, test } from "bun:test";
import { createToad } from "../src/toad";

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
