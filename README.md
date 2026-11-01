# HBOM Provenance & Compliance

Solidity smart contract for electronics **Hardware Bill of Materials (HBOM)** provenance — CSE 540, Group 18.

An electronics board is assembled from parts made by companies that never talk to each other, and each tier keeps its own records. This contract is a shared record instead: suppliers register component batches and attach compliance evidence, assemblers link batches into a board HBOM, auditors attest document hashes, and custody moves through a two-step handover. Only hashes and IPFS content identifiers go on-chain, so a buyer can re-hash any document and verify it. It proves document integrity and custody history — not physical authenticity.

A board is compliant only when every component has an attested, non-revoked RoHS, REACH, and FCC certificate. `verifyCompliance` returns the exact gaps, e.g. `["MCU-01:REACH"]`.

**Status:** draft — contract, interfaces, and deploy script complete; tests and client next.

## Layout

```
contracts/interfaces/IHBOMProvenance.sol   types, events, errors, signatures
contracts/HBOMProvenance.sol               implementation
scripts/deploy.ts                          deploys, grants demo roles, writes ABI
shared/deployments/                        generated address + ABI (gitignored)
hardhat.config.ts
```

## Roles

`SUPPLIER_ROLE` registers batches and adds documents to its own batches · `ASSEMBLER_ROLE` builds board HBOMs · `AUDITOR_ROLE` attests or revokes documents · `CUSTODIAN_ROLE` holds boards and receives custody · `DEFAULT_ADMIN_ROLE` grants all of the above. Separation of duties is enforced on-chain: an auditor cannot attest their own upload.

## Setup

Requires Node ≥ 22 and Bun (tested on 1.4.0). Dependencies: `hardhat ^3.21`, `@nomicfoundation/hardhat-viem ^3.1`, `viem ^2.57`, `@openzeppelin/contracts ^5.6`; `solc 0.8.28` downloads on first compile.

```bash
git clone https://github.com/pranavmandava/cse540-project.git
cd cse540-project && bun install
bunx hardhat compile
```

## Deploy locally

```bash
bunx hardhat node                                        # terminal 1, chain 31337
bunx hardhat run scripts/deploy.ts --network localhost   # terminal 2
```

Deploys `HBOMProvenance`, grants the four roles to Hardhat accounts #1–#4, and writes `shared/deployments/31337.json`. Import those printed private keys into MetaMask to act as each role, and add a network at `http://127.0.0.1:8545` with chain id `31337`. Omit `--network localhost` to smoke-test on an in-memory chain.

> Local test keys only — never reuse on a public network.

MIT licensed — see [LICENSE](LICENSE).
