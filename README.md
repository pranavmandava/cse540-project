# HBOM Provenance & Compliance

Solidity smart contract and React web client for electronics **Hardware Bill of Materials (HBOM)** provenance — CSE 540, Group 18.

An electronics board is assembled from parts made by companies that never talk to each other, and each tier keeps its own records. This project is a shared record instead: suppliers register component batches and attach compliance evidence, assemblers link batches into a board HBOM, auditors attest document hashes, and custody moves through a two-step handover. Only hashes and IPFS content identifiers go on-chain, so a buyer can re-hash any document and verify it. It proves document integrity and custody history — not physical authenticity.

A board is compliant only when every component has an attested, non-revoked RoHS, REACH, and FCC certificate. `verifyCompliance` returns the exact gaps, e.g. `["SSD-SAMSUNG-990PRO-2T-L2409:REACH"]`.

The demo dataset is a workstation HBOM: 30 real PC parts (CPU, motherboard, memory, SSD, case, PSU) curated from the public [docyx/pc-part-dataset](https://github.com/docyx/pc-part-dataset), with one six-part build assembled from them.

## Status

| Area | State |
| --- | --- |
| Contract, interface, deploy + seed scripts | **Implemented** — 4 roles, 8 write functions, 8 read functions, custom errors, indexed events |
| Test suite (`test/HBOMProvenance.test.ts`) | **Implemented** — 8 cases: happy path, unauthorized action, duplicate id, missing evidence, invalid transfer, two-step handover, double attestation + self-attestation, revocation |
| Web client (`web/`) | **Implemented** — TanStack Start on Cloudflare Workers, five role screens, wallet connection, live chain reads, same-origin RPC proxy |
| IPFS upload | **Implemented** — files are hashed in the browser, then pinned through `/api/ipfs` (Pinata, `PINATA_JWT` secret); without the secret the CID field stays manual |
| Gas analysis (`docs/gas-analysis.md`) | **Done** — every write/read path measured, plus three priced design alternatives (bytes32 ids, Merkle-root HBOM, flat roles) |
| Base Sepolia deployment | **Live** — contract [`0x803e3778…b6063422c`](https://sepolia.basescan.org/address/0x803e3778dd01ae83e9a25cb11942ef7b6063422c), app at https://hbom-provenance.pranav-techiegeek.workers.dev |
| Final report | `docs/final-report/` — IEEE-format source + rendered draft |

## Layout

```
contracts/interfaces/IHBOMProvenance.sol   types, events, errors, signatures
contracts/HBOMProvenance.sol               implementation
contracts/bench/GasBench.sol               measurement instruments for the design-alternative comparison
scripts/deploy.ts                          deploys and grants demo roles (local)
scripts/seed.ts                            deploys + loads the demo dataset (local)
scripts/seed-base-sepolia.ts               deploys + seeds the shared Base Sepolia instance
scripts/gas.ts                             gas measurement, prints the tables in docs/gas-analysis.md
shared/demo-parts.json                     curated part catalogue (30 parts, one board)
test/HBOMProvenance.test.ts                node:test suite over Hardhat 3 + viem
shared/deployments/                        generated { chainId, address, abi } (gitignored)
web/                                       TanStack Start app, deployable to Workers
  src/routes/                              one file per screen + /api/rpc + /api/ipfs
  src/lib/chain.ts                         viem client, snapshot loader, error decoding
docs/gas-analysis.md                       measured gas tables + design-alternative analysis
docs/final-demo-runbook.md                 script for the final 7-10 minute demo video
docs/final-report/                         IEEE-format technical report (LaTeX source)
```

## Roles

`SUPPLIER_ROLE` registers batches and adds documents to its own batches · `ASSEMBLER_ROLE` builds board HBOMs · `AUDITOR_ROLE` attests or revokes documents · `CUSTODIAN_ROLE` holds boards and receives custody · `DEFAULT_ADMIN_ROLE` grants all of the above. Separation of duties is enforced on-chain: an auditor cannot attest their own upload.

## Quick start

Requires Node ≥ 22 and Bun (tested on 1.4.0). Three terminals:

```bash
bun install

# 1. local chain
bun run node

# 2. deploy + seed (writes shared/deployments/31337.json)
bun run seed:local

# 3. web client at http://localhost:5173
cd web && bun install && bun run dev
```

> The app reads the generated deployment file at build time. Run the seed at least once before starting `web/`, and restart the dev server if you redeploy.

Add a network at `http://127.0.0.1:8545` with chain id `31337`, then bring the demo accounts into MetaMask:

```bash
bun run keystores     # writes shared/keystores/*.json, one per role
```

In MetaMask: **Add wallet → Private key → Select type: JSON File → Choose File → Import**, once per file (blank password). The files are derived from Hardhat's public dev mnemonic, so they match the addresses the node funds. Local test keys only — never reuse them on a public network.

Switch roles with the wallet chip in the header → **Switch account**, or with MetaMask's own account menu. The app re-reads `hasRole` and every screen follows the active account.

### Why the web app proxies RPC

Browsers now block a page on `localhost` from calling `127.0.0.1:8545` directly (Chrome Local Network Access). The client therefore talks to `/api/rpc` on its own origin, and the server forwards JSON-RPC to the node. Deployed on Workers, the proxy reads the `RPC_URL` var (set with `wrangler deploy --var RPC_URL:…`), so a public endpoint or an RPC API key never reaches the browser.

### Certificate upload to IPFS

The browser computes `keccak256(file)` locally — that hash, not the upload, is what the contract stores and what the auditor re-verifies. The file itself is then pinned through `/api/ipfs`, which forwards to Pinata using the `PINATA_JWT` Worker secret (`bunx wrangler secret put PINATA_JWT`; in local dev, copy `web/.dev.vars.example` to `web/.dev.vars`). Without the secret the endpoint answers 503, the UI says so, and the CID can be typed by hand: the trust model degrades to hash-only, never to nothing.

## Testnet deployment (Base Sepolia)

The local Hardhat node is the graded demo path — deterministic, offline, free. The shared public deployment exists so anyone can click a live URL without running anything:

**Live instance:** https://hbom-provenance.pranav-techiegeek.workers.dev reading contract [`0x803e3778dd01ae83e9a25cb11942ef7b6063422c`](https://sepolia.basescan.org/address/0x803e3778dd01ae83e9a25cb11942ef7b6063422c) on Base Sepolia (chain 84532), seeded with the demo board and its one deliberate REACH gap. Reads need no wallet; writes need the two throwaway keys from `.env` imported into MetaMask.

Reproducing it from scratch:

```bash
# 0. once: copy .env.example to .env and generate two throwaway keys
#    (never reuse the local-dev Hardhat keys on a public network)
# 1. fund the DEPLOYER address from the Coinbase Developer Platform faucet
#    (https://portal.cdp.coinbase.com — Onchain Tools -> Faucet; no mainnet
#    balance required, drips 0.0001 ETH per claim, ~20 claims is plenty)
# 2. deploy + seed the demo board (writes shared/deployments/84532.json)
bun run seed:base
# 3. build the client for chain 84532 and publish the Worker
bun run deploy:web:base
```

On-chain separation of duties is preserved with two accounts: the deployer holds admin + supplier + assembler + custodian, a second throwaway key holds only `AUDITOR_ROLE` — so self-attestation still reverts on the public chain exactly as it does locally.

## Gas analysis

`docs/gas-analysis.md` prices every write and read path on the in-memory chain (reproduce with `bun run gas`), including the three design alternatives the report discusses: `bytes32` ids, a Merkle-root HBOM, and flat role checks. Headline numbers: certificates dominate the world cost (69% of ~28.9M gas for the seeded dataset), ids under 32 characters are effectively free as strings, the Merkle alternative saves ~87% on assembly and verification but loses exact-gap enumeration, and OpenZeppelin `AccessControl` costs +0.3% per gated call over a hand-rolled mapping.

## Demo flow

The seed deliberately leaves one gap, so the demo has work to do:

1. **Verify** — `AXIOM-WS-2026-SN-000418` is *not compliant*; the missing evidence is `SSD-SAMSUNG-990PRO-2T-L2409:REACH`.
2. **Supplier** — register a batch, or add the missing REACH declaration. The browser hashes the chosen file with keccak256 before sending.
3. **Audit** — the new document appears in the pending queue. Attest it.
4. **Verify** — the same board is now *compliant*, with 18 attested certificates.
5. **Custody** — the assembler offers the board to the distributor; the distributor accepts in a second transaction.
6. Optional: revoke an attestation and watch compliance flip back.

Sending from the wrong account is a feature of the demo: the contract reverts with `AccessControlUnauthorizedAccount`, and the UI decodes it.

## Tests

```bash
bun run test
```

The suite runs on Hardhat's in-memory chain with `node:test` + viem assertions. It covers the protocol rules the proposal promised: unauthorized actions, duplicate ids, invalid transfers, missing evidence, double attestation, and revocation.

## Deliberately out of scope

Versioned certificates, multi-board pagination, upgradeability/pausability, access-control admin screens, and automated gas reporting (the plugin line is Hardhat 2 only; `scripts/gas.ts` captures receipts directly). Everything else the proposal promised — RBAC, evidence hashing, off-chain document storage, custody handover, a public testnet deployment, and the gas/privacy analysis — is in the repo.

MIT licensed — see [LICENSE](LICENSE).
