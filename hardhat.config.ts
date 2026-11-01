import { defineConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";

/**
 * Hardhat 3 configuration for the HBOM provenance prototype.
 *
 * Notes for the team:
 * - `contracts/` is the default source path, so nothing to override.
 * - The default (in-memory) network is used by `bun run test`.
 * - `localhost` is used by `bun run deploy:local`, which expects a running
 *   `bun run node` in another terminal.
 * - A Base Sepolia entry is added in P4 (see plan.md, "Shared testnet"); the
 *   graded demo path is local only, matching what the proposal committed to.
 */
export default defineConfig({
  plugins: [hardhatViem],

  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },
  },
});
