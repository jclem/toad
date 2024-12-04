import { Middleware, createRouter } from "@jclem/router";
import crypto from "node:crypto";

function assignRequestID<I, P>(): Middleware<I, I & { requestID: string }, P> {
  return function ({ request, locals }, next) {
    const requestID = request.headers.get("request-id") || crypto.randomUUID();
    return next({ ...locals, requestID });
  };
}

function logRequest<I extends { requestID: string }, P>(): Middleware<I, I, P> {
  return async function ({ request, locals }, next) {
    const startTime = process.hrtime.bigint();
    const response = await next(locals);
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    console.log(
      `${locals.requestID} ${request.method} ${request.url} ${response.status} ${elapsedMs}ms`,
    );
    return response;
  };
}

const router = createRouter()
  .use(assignRequestID())
  .use(logRequest())
  .get("/", () => Response.json({ ok: true }));
