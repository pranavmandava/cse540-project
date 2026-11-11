import { createFileRoute } from "@tanstack/react-router";

/**
 * Same-origin JSON-RPC proxy.
 *
 * Browsers block a page served from localhost from calling http://127.0.0.1:8545
 * directly (Chrome's Local Network Access permission), so the app talks to this
 * route instead and the server forwards the call to the Hardhat node. Deployed
 * on Workers, RPC_URL points at a public endpoint and the browser never sees it.
 */
const UPSTREAM = "http://127.0.0.1:8545";

export const Route = createFileRoute("/api/rpc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();

        try {
          const upstream = await fetch(UPSTREAM, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });

          return new Response(upstream.body, {
            status: upstream.status,
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
