import { type setHeader, type withResponse } from "./middleware";
import { RequestCtx } from "./toad";

/**
 * Create a JSON response object (using {@link Response.json}).
 *
 * If the context locals have a `response` property with headers, those headers
 * will be used in the response (but can be overriden entirely with the `init`
 * parameter).
 *
 * This is especially useful paired with middleware like {@link withResponse}
 * and {@link setHeader}:
 *
 *     createToad()
 *       .use(withResponse())
 *       .use(setHeader("foo", "bar"))
 *       .get("/", (ctx) => json(ctx, { ok: true }))
 *
 * In this example, the response would include the headers set by the
 * middleware.
 *
 * @param ctx The request context object passed to the handler
 * @param body The body of the response
 * @param init An optional response init
 * @returns A response object
 */
export function json<L extends unknown, P extends unknown>(
  ctx: RequestCtx<L, P>,
  body: unknown,
  init?: ResponseInit | number
): Response {
  const headers = getHeaders(ctx.locals);
  const respInit = typeof init === "number" ? { status: init } : init;

  return Response.json(body, {
    ...respInit,
    headers: respInit?.headers ?? headers ?? undefined,
  });
}

function getHeaders(locals: {}): Headers | null {
  if (
    locals &&
    typeof locals === "object" &&
    "response" in locals &&
    locals.response &&
    typeof locals.response === "object" &&
    "headers" in locals.response &&
    locals.response.headers instanceof Headers
  ) {
    return locals.response.headers;
  }

  return null;
}
