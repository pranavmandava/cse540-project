import { defineConfig } from "hardhat/config";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";

/**
 * Hardhat 3 configuration for the HBOM provenance prototype.
 *
 * Notes for the team:
 * - `contracts/` is the default source path, so nothing to override.
 * - The default (in-memory) network is used by `bun run test` and `bun run gas`.
 * - `localhost` is used by `bun run seed:local`, which expects a running
 *   `bun run node` in another terminal.
 * - `base-sepolia` is the shared public network (plan.md "Shared testnet").
 *   Its two throwaway accounts live in `.env` (see `.env.example`); the
 *   deployer is the only one a faucet has to fund — the seed script forwards
 *   gas money to the auditor itself. Local-dev Hardhat keys are never reused
 *   there.
 */
export default defineConfig({
  plugins: [hardhatViem, hardhatNodeTestRunner],

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
    "base-sepolia": {
      type: "http",
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      chainId: 84532,
      accounts: [
        ...(process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []),
        ...(process.env.AUDITOR_PRIVATE_KEY ? [process.env.AUDITOR_PRIVATE_KEY] : []),
      ],
    },
  },
});
