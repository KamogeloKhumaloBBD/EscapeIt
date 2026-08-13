import type { RequestHandler } from "express";

export function createWebRequestHandler(
  handler: (request: Request) => Promise<Response>,
  publicAppUrl: string,
): RequestHandler {
  const origin = publicAppUrl.replace(/\/$/, "");

  return async (request, response, next) => {
    try {
      const headers = new Headers();

      for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === "string") {
          headers.set(name, value);
        } else if (Array.isArray(value)) {
          for (const item of value) {
            headers.append(name, item);
          }
        }
      }

      const webResponse = await handler(
        new Request(`${origin}${request.originalUrl}`, {
          headers,
          method: request.method,
        }),
      );

      response.status(webResponse.status);
      webResponse.headers.forEach((value, name) => {
        response.setHeader(name, value);
      });
      response.send(Buffer.from(await webResponse.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  };
}
