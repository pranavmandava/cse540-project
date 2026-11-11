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
| Web client (`web/`) | **Implemented for the demo** — TanStack Start on Cloudflare Workers, five role screens, wallet connection, live chain reads |
| IPFS upload | **In progress** — hashes are computed in the browser; CIDs are accepted but no Pinata upload yet |
| Base Sepolia deployment | **Not started** — the graded demo runs against a local Hardhat node |
| Gas analysis, privacy discussion, final report | **Not started** — final milestone, Dec 4 |

## Layout

```
contracts/interfaces/IHBOMProvenance.sol   types, events, errors, signatures
contracts/HBOMProvenance.sol               implementation
scripts/deploy.ts                          deploys and grants demo roles
scripts/seed.ts                            deploys + loads the demo dataset
shared/demo-parts.json                     curated part catalogue (30 parts, one board)
test/HBOMProvenance.test.ts                node:test suite over Hardhat 3 + viem
shared/deployments/                        generated { chainId, address, abi } (gitignored)
web/                                       TanStack Start app, deployable to Workers
  src/routes/                              one file per screen
  src/lib/chain.ts                         viem client, snapshot loader, error decoding
  src/routes/api/rpc.ts                    same-origin JSON-RPC proxy
docs/demo-runbook.md                       demo script, timing, and scope boundaries
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

Browsers now block a page on `localhost` from calling `127.0.0.1:8545` directly (Chrome Local Network Access). The client therefore talks to `/api/rpc` on its own origin, and the server forwards JSON-RPC to the node. The browser never needs the RPC URL, and a deployed Worker can point the proxy at a public endpoint instead.

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

Versioned certificates, multi-board pagination, IPFS upload, testnet deployment, gas-report automation, and access-control admin screens. See `docs/demo-runbook.md` for why each is deferred.

MIT licensed — see [LICENSE](LICENSE).
