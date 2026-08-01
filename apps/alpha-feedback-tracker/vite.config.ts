import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { request as httpRequest } from "node:http";

const host = process.env.TAURI_DEV_HOST;

/**
 * Same-origin proxy so the browser never hits Vercel CORS / SSO preflight walls.
 * Client calls `/__polycal/<path>` with header `x-polycal-target: https://…`.
 */
function polycalProxyPlugin(): Plugin {
  return {
    name: "polycal-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__polycal")) {
          next();
          return;
        }
        void proxyPolycal(req, res).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: `Proxy failed: ${message}` }));
          }
        });
      });
    },
  };
}

function collectSetCookies(
  existing: string | undefined,
  setCookie: string | string[] | undefined,
): string | undefined {
  if (!setCookie) return existing;
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  const pairs = parts
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean);
  if (pairs.length === 0) return existing;
  return existing ? `${existing}; ${pairs.join("; ")}` : pairs.join("; ");
}

async function upstreamRequest(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{ status: number; headers: IncomingMessage["headers"]; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        ...headers,
        "content-length": String(body.length),
      },
    };
    const req = transport(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 502,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    if (body.length > 0) req.write(body);
    req.end();
  });
}

async function proxyPolycal(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const targetBase = req.headers["x-polycal-target"];
  if (typeof targetBase !== "string" || !/^https?:\/\//i.test(targetBase)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing x-polycal-target header." }));
    return;
  }

  const incomingUrl = new URL(req.url ?? "/", "http://localhost");
  const pathWithQuery =
    incomingUrl.pathname.replace(/^\/__polycal/, "") + incomingUrl.search;
  let target = new URL(pathWithQuery || "/", targetBase.replace(/\/+$/, ""));

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  const method = (req.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": req.headers["content-type"] ?? "application/json",
  };
  if (typeof req.headers.authorization === "string") {
    headers.authorization = req.headers.authorization;
  }
  // Send bypass on every hop — do NOT set bypass-cookie (that triggers a 307).
  if (typeof req.headers["x-vercel-protection-bypass"] === "string") {
    headers["x-vercel-protection-bypass"] =
      req.headers["x-vercel-protection-bypass"];
  }

  let cookieHeader: string | undefined;
  let response = await upstreamRequest(target, method, headers, body);

  for (let hop = 0; hop < 5; hop += 1) {
    if (![301, 302, 307, 308].includes(response.status)) break;
    const location = response.headers.location;
    if (!location) break;

    cookieHeader = collectSetCookies(cookieHeader, response.headers["set-cookie"]);
    target = new URL(location, target);
    const nextHeaders = { ...headers };
    if (cookieHeader) nextHeaders.cookie = cookieHeader;

    // 307/308 keep method + body; 301/302 for POST become GET without body.
    const keepBody = response.status === 307 || response.status === 308;
    response = await upstreamRequest(
      target,
      keepBody ? method : method === "POST" || method === "PATCH" ? "GET" : method,
      nextHeaders,
      keepBody ? body : Buffer.alloc(0),
    );
  }

  res.statusCode = response.status;
  const contentType = response.headers["content-type"];
  if (contentType) res.setHeader("Content-Type", contentType);
  res.end(response.body);
}

export default defineConfig(async () => ({
  plugins: [react(), polycalProxyPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
