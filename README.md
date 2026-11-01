# cse540-project

Solidity smart contract for **electronics Hardware Bill of Materials (HBOM) provenance and compliance** — CSE 540, Group 18.

Suppliers register component batches and attach compliance evidence. Assemblers link those batches into a board-level HBOM. Auditors attest that the document a supplier uploaded is the file they actually reviewed. Custody of a finished board moves through an explicit two-step handover. Buyers read the whole history from the chain.

---

## Table of contents

- [Status](#status)
- [The problem](#the-problem)
- [What the contract does](#what-the-contract-does)
- [What it does not do](#what-it-does-not-do)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Roles](#roles)
- [Contract interface](#contract-interface)
- [Dependencies](#dependencies)
- [Setup](#setup)
- [Compile](#compile)
- [Deploy locally](#deploy-locally)
- [Demo walkthrough](#demo-walkthrough)
- [Roadmap](#roadmap)
- [Team](#team)
- [License](#license)

---

## Status

**Draft contract.** This repository currently contains the contract design, its interfaces, and a working deployment script. The test suite and the React client are scheduled next (see [Roadmap](#roadmap)).

The contract in this repository compiles with `solc 0.8.28` and deploys successfully on a local Hardhat node.

## The problem

An electronics board is assembled from components made by companies that never talk to each other. Each tier keeps its own records of what went into a product and which compliance certificates cover it. When a hazardous-material regulation changes, or a counterfeit part shows up downstream, nobody can reconstruct the chain of custody quickly — and no single firm is trusted to hold the authoritative copy.

We propose a shared record that links registered component batches to assembled boards, attaches compliance evidence as hashes, and tracks custody. No participant gets unilateral control, and any participant can verify a claim without asking the others.

## What the contract does

| Capability | Where |
| --- | --- |
| Register a component batch with a datasheet hash + IPFS CID | `registerComponent` |
| Attach a compliance document (RoHS / REACH / FCC) to a batch | `addCertificate` |
| Independent auditor attests the document hash matches the reviewed file | `attestCertificate` |
| Auditor withdraws an attestation after a failed re-inspection | `revokeCertificate` |
| Link registered batches into a board-level HBOM | `assembleHBOM` |
| Two-step custody handover (offer, then accept) | `initiateTransfer` / `acceptTransfer` / `cancelTransfer` |
| Evaluate a board against the compliance rule | `verifyCompliance` |
| Retrieve a board's full audit trail in one call | `getBoardLineage` |

**Compliance rule:** a board is compliant only when every component has at least one *attested, non-revoked* certificate of *every* required type (RoHS, REACH, FCC). `verifyCompliance` returns the exact gaps, e.g. `["MCU-01:REACH", "PCB-02:FCC"]`, rather than a bare boolean, so an operator can act on the result.

## What it does not do

Stated plainly, because the distinction matters for the report:

- It does **not** prove a component is physically genuine. It proves that the certificate attached to a batch is the same file an auditor reviewed.
- It does **not** replace laboratory testing or regulatory certification.
- It does **not** stop a supplier from registering a batch that does not exist. It makes that claim permanent and attributable, which is the actual deterrent.
- It does **not** store documents on-chain — only CIDs and `keccak256` hashes. Full PDFs live on IPFS.

## Architecture

```
   Browser (supplier / assembler / auditor / custodian / buyer)
        |                                        |
        | read: JSON-RPC                         | write: signed tx from wallet
        v                                        v
  +-------------------------------------------------------+
  |  Solidity: HBOMProvenance                             |
  |  AccessControl roles, batch links, custody,           |
  |  document hashes + CIDs, events                       |
  +-------------------------------------------------------+
        |                                    |
        | CID lookup                         | events -> audit trail
        v                                    v
     IPFS / Pinata                     off-chain indexer (planned)

  Planned: React + TanStack Start client, served from Cloudflare Workers,
  with the Worker acting as an RPC proxy so no provider key ships in the bundle.
```

On-chain vs off-chain is a deliberate split:

| On-chain | Off-chain |
| --- | --- |
| Component and board IDs | Full compliance PDFs |
| `keccak256` document hashes | Datasheets |
| IPFS content identifiers | Rendered provenance pages |
| Roles, custody state, timestamps | |
| Events for every state change | |

Storing a hash on-chain means anyone can download the document from IPFS, re-hash it, and compare. That check is the trust story; the chain is only the anchor.

## Repository layout

```
contracts/
  interfaces/IHBOMProvenance.sol   types, events, errors, function signatures
  HBOMProvenance.sol               implementation
scripts/
  deploy.ts                        deploys + grants demo roles + writes ABI/address
shared/
  deployments/                     generated per-chain address + ABI (gitignored)
hardhat.config.ts
```

`shared/deployments/` is written by the deploy script so the frontend never hand-copies an address or an ABI.

## Roles

Four operational roles plus OpenZeppelin's `DEFAULT_ADMIN_ROLE`, which grants and revokes them.

| Role | Held by | Can |
| --- | --- | --- |
| `SUPPLIER_ROLE` | Tier-2 component vendors | Register batches; add documents **to batches they registered** |
| `ASSEMBLER_ROLE` | Tier-1 manufacturers | Assemble boards from registered batches |
| `AUDITOR_ROLE` | Regulators / third-party labs | Attest or revoke documents |
| `CUSTODIAN_ROLE` | Anyone allowed to hold a board | Receive custody; initiate or cancel a handover |
| `DEFAULT_ADMIN_ROLE` | Course admin account | Grant and revoke the roles above |

Separation of duties is enforced on-chain: an auditor cannot attest a document they uploaded themselves, and a supplier cannot attach documents to another supplier's batch. Both are revert conditions, not conventions.

## Contract interface

Full NatSpec lives in [`contracts/interfaces/IHBOMProvenance.sol`](contracts/interfaces/IHBOMProvenance.sol). Summary:

**Supplier**
```solidity
function registerComponent(string componentId, bytes32 datasheetHash, string datasheetCID) external;
function addCertificate(string componentId, CertType certType, bytes32 docHash, string docCID)
    external returns (uint256 certId);
```

**Auditor**
```solidity
function attestCertificate(uint256 certId) external;
function revokeCertificate(uint256 certId, string reason) external;
```

**Assembler**
```solidity
function assembleHBOM(string boardId, string[] componentIds) external; // max 16, no duplicates
```

**Custody**
```solidity
function initiateTransfer(string boardId, address newCustodian) external;
function acceptTransfer(string boardId) external;
function cancelTransfer(string boardId) external;
```

**Reads**
```solidity
function verifyCompliance(string boardId) external view returns (bool compliant, string[] missing);
function getBoardLineage(string boardId) external view
    returns (Board, string[] componentIds, Component[] components, Certificate[][] certificates);
function getComponent(string componentId) external view returns (Component);
function getComponentCertificates(string componentId) external view returns (Certificate[]);
function getBoard(string boardId) external view returns (Board);
function getBoardComponents(string boardId) external view returns (string[]);
```

Every state change emits an event (`ComponentRegistered`, `CertificateAdded`, `CertificateAttested`, `CertificateRevoked`, `BoardAssembled`, `TransferInitiated`, `TransferAccepted`, `TransferCancelled`), so a participant without a role can still rebuild the history from logs.

## Dependencies

| Package | Version | Why |
| --- | --- | --- |
| `hardhat` | ^3.21.2 | compile, local node, deploy |
| `@nomicfoundation/hardhat-viem` | ^3.1.0 | viem bindings for scripts and tests |
| `viem` | ^2.57.14 | Ethereum client (also what the frontend will use) |
| `@openzeppelin/contracts` | ^5.6.1 | `AccessControl` |
| `solc` | 0.8.28 | pinned in `hardhat.config.ts`, downloaded by Hardhat |
| Node.js | ≥ 22 | required by Hardhat 3 |
| Bun | ≥ 1.1 | package manager and script runner |

## Setup

```bash
git clone https://github.com/pranavmandava/cse540-project.git
cd cse540-project
bun install
```

Hardhat downloads `solc 0.8.28` on first compile; no global Solidity install is needed.

## Compile

```bash
bunx hardhat compile
```

Expected output: `Compiled 2 Solidity files with solc 0.8.28`.

## Deploy locally

The graded demo runs against a local node — no testnet, no faucet, no real funds, matching the proposal's "local execution avoids transaction payments".

```bash
# terminal 1: start a local chain on http://127.0.0.1:8545 (chain id 31337)
bunx hardhat node

# terminal 2: deploy and grant the demo roles
bunx hardhat run scripts/deploy.ts --network localhost
```

The script prints the contract address, grants `SUPPLIER_ROLE` / `ASSEMBLER_ROLE` / `AUDITOR_ROLE` / `CUSTODIAN_ROLE` to the first five funded accounts, and writes `shared/deployments/31337.json` containing the address, chain id, role assignments, and ABI.

To smoke-test without a running node:

```bash
bunx hardhat run scripts/deploy.ts   # in-memory network, exits when done
```

### Acting as different roles

`hardhat node` prints 20 funded accounts with their private keys. Import the ones you need into MetaMask (or any injected wallet) and switch between them:

| Account | Role |
| --- | --- |
| #0 | admin |
| #1 | supplier |
| #2 | assembler + custodian |
| #3 | auditor |
| #4 | custodian (buyer) |

Add a network in the wallet pointing at `http://127.0.0.1:8545` with chain id `31337`.

> These keys are public test keys from Hardhat's default mnemonic. **Never** send real funds to them or reuse them on a public network.

## Demo walkthrough

Planned end-to-end flow for the Nov 20 prototype:

1. **Supplier** registers three component batches and uploads a RoHS/REACH/FCC document for each. `verifyCompliance` on the board would still fail — no auditor has looked at anything yet.
2. **Assembler** creates a board HBOM from those three batches.
3. **Auditor** downloads each document from IPFS, re-hashes it, and attests. Compliance flips to `true` once the last required document is attested.
4. **Auditor** revokes one attestation to show compliance flipping back to `false` with the exact gap listed.
5. **Assembler** offers custody to the distributor, who accepts. `getBoardLineage` shows the full component, document, and custody history in one read.
6. An unauthorised account tries to register a component and is rejected on-chain.

## Roadmap

| Phase | Deliverable | Target |
| --- | --- | --- |
| P0 | Contract draft, interfaces, README, deploy script | Nov 1 |
| P1 | Test suite (unauthorised actions, duplicate IDs, invalid transfers, missing evidence), seeded demo data, gas capture | Nov 6 |
| P2 | TanStack Start client on Cloudflare Workers, wallet connect, read-only board lookup | Nov 12 |
| P3 | Full transaction flows, IPFS upload through a Worker secret | Nov 16 |
| P4 | Base Sepolia deployment, live demo URL, 5-minute video | Nov 20 |
| P5 | Gas analysis, privacy discussion, final report | Dec 4 |

## Team

Group 18 — ASU CSE 540, Fall 2026 B

| Member | Area |
| --- | --- |
| Pranav Mandava | Registration, data modelling, coordination |
| Suhas Gajula | Access control, events, transaction screens |
| Thushar Reddy Vemula | HBOM links, evidence verification, IPFS |
| Varshini Akula | Hardhat tests, demo preparation |
| Venkata Pradeep Reddy Venuthurla | Contract, IPFS, and client integration |

## License

MIT — see [LICENSE](LICENSE).
