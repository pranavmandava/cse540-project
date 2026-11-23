import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * Same-origin JSON-RPC proxy.
 *
 * Browsers block a page served from localhost from calling http://127.0.0.1:8545
 * directly (Chrome's Local Network Access permission), so the app talks to this
 * route instead and the server forwards the call to the chain. Deployed on
 * Workers, the RPC_URL var (set with `wrangler deploy --var RPC_URL:…`) points
 * at a public endpoint and the browser never sees it.
 */
export const Route = createFileRoute("/api/rpc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const upstream = env.RPC_URL ?? "http://127.0.0.1:8545";

        try {
          const response = await fetch(upstream, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });

          return new Response(response.body, {
            status: response.status,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          });
        } catch (error) {
          return Response.json(
            {
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32603,
                message: `RPC upstream unreachable: ${error instanceof Error ? error.message : String(error)}`,
              },
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
