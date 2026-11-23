import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

/**
 * Certificate upload to IPFS via Pinata.
 *
 * The browser hashes the file with keccak256 before anything leaves the
 * machine; this route is pure convenience storage so the CID stored on-chain
 * actually resolves. PINATA_JWT is a Worker secret (`wrangler secret put
 * PINATA_JWT`) or, in local dev, an entry in web/.dev.vars. Without it the
 * route answers 503 and the register screen falls back to a typed CID.
 */
const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, generous for a one-page declaration

export const Route = createFileRoute("/api/ipfs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!env.PINATA_JWT) {
          return Response.json(
            { error: "IPFS upload is not configured: set the PINATA_JWT secret." },
            { status: 503 },
          );
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
        }

        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: "Missing or empty file field." }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "File exceeds the 10 MB limit." }, { status: 413 });
        }

        // Forward bytes untouched: the keccak256 the client computed stays
        // valid because the upload is byte-identical.
        const pinata = new FormData();
        pinata.append("file", file, file.name);

        try {
          const response = await fetch(PINATA_PIN_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
            body: pinata,
          });

          if (!response.ok) {
            const detail = await response.text();
            return Response.json(
              { error: `Pinata rejected the upload (${response.status}): ${detail.slice(0, 300)}` },
              { status: 502 },
            );
          }

          const result = (await response.json()) as { IpfsHash?: string };
          if (!result.IpfsHash) {
            return Response.json({ error: "Pinata returned no CID." }, { status: 502 });
          }

          return Response.json(
            { cid: result.IpfsHash, gateway: `https://ipfs.io/ipfs/${result.IpfsHash}` },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return Response.json(
            { error: `Upload failed: ${error instanceof Error ? error.message : String(error)}` },
            { status: 502 },
          );
        }
      },
    },
  },
});
