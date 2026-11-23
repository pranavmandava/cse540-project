/// <reference types="vite/client" />

/**
 * Bindings for the deployed Cloudflare Worker and the local dev runtime.
 * Plain vars (RPC_URL) can live in wrangler.jsonc or be passed with
 * `wrangler deploy --var`; secrets (PINATA_JWT) are set with
 * `wrangler secret put` and, for local dev, in web/.dev.vars.
 */
declare module "cloudflare:workers" {
  export const env: {
    /** JSON-RPC upstream for /api/rpc. Local dev falls back to the Hardhat node. */
    RPC_URL?: string;
    /** Pinata API JWT; without it /api/ipfs answers 503 and the CID stays manual. */
    PINATA_JWT?: string;
  };
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
}

interface Window {
  ethereum?: EthereumProvider;
}
