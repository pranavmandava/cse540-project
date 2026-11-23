# Gas Analysis

Measured with `bun run gas` (`scripts/gas.ts`) on Hardhat 3's in-memory chain:
solc 0.8.28, optimizer 200 runs, EVM target cancun. Every write is a real
transaction; the numbers are `receipt.gasUsed`, so intrinsic cost and the
`AccessControl` check are included. Views are `eth_estimateGas` on an
`eth_call` — free for off-chain readers, but the price another contract
would pay, and a direct signal of on-chain read complexity. The three bench
contracts (`contracts/bench/GasBench.sol`) keep everything except the design
choice under test identical to `HBOMProvenance`, so their deltas isolate that
choice.

## Measured operations

| Operation | Gas | Notes |
| --- | ---: | --- |
| deploy HBOMProvenance | 3,187,558 | constructor + DEFAULT_ADMIN grant |
| grantRole | 51,495 | per-holder cost is flat: OZ v5 stores the role admin lazily, so a role's first holder costs the same as later ones |
| grantRole | 51,495 | second holder of the same role (confirms the flat cost) |
| grantRole | 51,495 | first holder of ASSEMBLER |
| grantRole | 51,495 | first holder of AUDITOR |
| grantRole | 51,495 | first holder of CUSTODIAN |
| grantRole | 51,507 | second holder of CUSTODIAN |
| registerComponent | 119,694 | 10-char id: string fits one slot |
| registerComponent | 119,814 | 20-char id: one data slot |
| registerComponent | 119,946 | 31-char id: one data slot, full |
| registerComponent | 164,851 | 40-char id: two data slots |
| addCertificate | 221,392 | append position 1 (new array slot) |
| addCertificate | 224,204 | append position 2 |
| addCertificate | 224,204 | append position 3 |
| attestCertificate | 57,270 | two flag SSTOREs + timestamp |
| revokeCertificate | 51,600 | single flag SSTORE, reason in the event only |
| assembleHBOM | 166,299 | 1 component, O(n^2) duplicate check |
| assembleHBOM | 352,534 | 6 components, O(n^2) duplicate check |
| assembleHBOM | 678,456 | 16 components, O(n^2) duplicate check |
| initiateTransfer | 37,770 | pendingCustodian + state SSTOREs |
| acceptTransfer | 37,910 | custodian swap + state reset |
| cancelTransfer | 34,470 | clear pendingCustodian, reset state |
| getComponent (view) | 33,163 | one struct read |
| getBoardComponents (view) | 43,487 | 6 string ids copied to memory |
| verifyCompliance (view) | 205,538 | 6 components x 3 cert types, all attested |
| verifyCompliance (view) | 502,165 | 16 components x 3 cert types, all attested |
| verifyCompliance (view) | 207,452 | 6 components, one unattested REACH gap |
| getBoardLineage (view) | 546,811 | board + 6 components + 18 certificates |
| FlatRoleBench.enroll | 43,917 | vs grantRole: one bool SSTORE, no admin branch, no event |
| FlatRoleBench.register | 119,423 | vs registerComponent (20-char): same writes, flat role check |
| Bytes32Bench.register | 115,343 | vs registerComponent (31-char): id in one slot, no string copy |
| Bytes32Bench.assemble | 289,498 | vs assembleHBOM (6): word ids, word comparison, same O(n^2) |
| MerkleBench.assemble | 45,747 | vs assembleHBOM (6): one root SSTORE, no per-component state |
| MerkleBench.verify (view) | 27,750 | vs verifyCompliance (6): 3-node proof walk, no storage scans |
| MerkleBench.verify (view) | 29,000 | 4-node proof walk for a 16-leaf HBOM |
| seed the demo world (computed) | 28,918,618 | 30 registers + 89 (addCertificate + attestCertificate) + 1 assemble(6) |

## What the numbers say

### 1. Certificates dominate everything

The composed cost of seeding the 30-part demo world is **~28.9M gas**, and
**~20.0M of it (69%) is `addCertificate`**: 89 documents at ~224k each. The
registry itself — 30 component batches plus one assembly — is the cheap
part. Any redesign that wants to cut chain cost must therefore change how
*compliance evidence* is stored, not how components are keyed.

`addCertificate` is expensive by design: it writes a full `Certificate`
struct (two strings plus nine value fields) and appends to a per-component
index. The alternative — one hash per certificate batch — would collapse 89
documents into a handful of slot writes, at the cost of the exact
per-document history the auditor screen is built on.

### 2. Id representation: strings are nearly free up to 31 characters

`registerComponent` is flat at ~119.7k–119.9k for ids of 10, 20 and 31
characters: Solidity packs short strings into a single storage slot, so a
human-readable id costs the same as a `bytes32` id. The measured premium of
the string key over `Bytes32Bench` (same body, word id) is **~4.6k gas
(+3.8%)** — calldata hashing and copy, not storage.

The cliff is at 32 characters: a 40-char id costs 164,851 (+45k, the second
data slot). The lesson is a naming convention, not a type change: **keep
component ids under 32 characters and strings cost nothing extra**. Our real
dataset ids (`SSD-SAMSUNG-990PRO-2T-L2409`, 25 chars) sit safely below it.

Strings do cost on the *assembly* path: `assembleHBOM` with 6 string members
is 352,534 vs 289,498 for the `bytes32` bench (**+63k, ~22%**), because each
`string[]` member is a pointer to separately-stored data while a `bytes32[]`
member is one slot. That is 10.5k per member — real, but an order of
magnitude below the certificate term.

### 3. Scaling is linear in HBOM size, and the cap keeps it sane

Both the assembly write and the compliance read scale linearly:

| Components | assembleHBOM | verifyCompliance (view) |
| ---: | ---: | ---: |
| 1 | 166,299 | — |
| 6 | 352,534 | 205,538 |
| 16 | 678,456 | 502,165 |

`MAX_COMPONENTS = 16` bounds the worst case at ~678k to assemble and ~502k
for an on-chain compliance read — comfortably inside the 30M gas block limit,
with the O(n²) duplicate check contributing negligibly at n ≤ 16 (word
comparisons after a single calldata keccak per pair). The view cost is
irrelevant for the web client (reads are free off-chain) but would matter if
another contract consumed `verifyCompliance` on-chain; at 16 components it
still fits a block.

The gap path (207,452 vs 205,538 for a fully attested board) shows that
reporting exact missing-document strings (`"SSD-…:REACH"`) costs almost
nothing beyond the scan itself — the buyer-facing error message is
essentially free, which is why we kept it on-chain instead of returning a
bare boolean.

### 4. The Merkle-root alternative: 87% cheaper, and we still said no

| Board of 6 components | Gas |
| --- | ---: |
| `assembleHBOM` (per-component records) | 352,534 |
| `MerkleBench.assemble` (single HBOM root) | 45,747 |
| `verifyCompliance` view (per-component records) | 205,538 |
| `MerkleBench.verify` view (3-node proof) | 27,750 |

Storing one Merkle root per board is **~87% cheaper on both paths**, and its
verification cost is nearly flat in HBOM size (27,750 → 29,000 for 6 → 16
leaves, vs a 205k → 502k linear scan). That is the right architecture when
the only question is "is *this exact* HBOM the one that was certified?".

It is the wrong architecture for this system, and the reasons are
functional, not gas-price ones: a root can answer *membership*, but not
*"which documents are missing"* — the exact-gap enumeration that drives the
buyer badge and the demo. It also ends per-certificate history: revocation
becomes "rebuild the tree", and the auditor queue loses its per-document
workflow. We therefore keep per-component records on-chain at course scale
and note the hybrid for production: per-component *roots* with off-chain
document proofs, enumerated by an indexer rather than by an on-chain scan.

### 5. OpenZeppelin AccessControl is worth its premium

| Mechanism | Enroll/grant | Gated call (register) |
| --- | ---: | ---: |
| `grantRole` (AccessControl) | 51,495 | 119,814 |
| `FlatRoleBench` (flat mapping) | 43,917 | 119,423 |

The premium is **~7.6k per enrollment** (the `RoleGranted` event and the
admin-branch check) and **~391 gas per gated call (+0.3%)**. For that, the
contract gets a role-admin hierarchy, standardized events for every grant and
revocation (the governance record the project is trying to demonstrate), and
ERC-165 introspection. A hand-rolled mapping saves a rounding error and
loses the audit trail; the flat bench exists in this doc to prove that with
numbers rather than assertion.

### 6. What the whole world costs

Seeding the demo dataset — 30 component registrations, 89 upload+attest
pairs, one six-part assembly — composes to **~28.9M gas ≈ 0.58 ETH at
20 gwei**. At testnet prices that is free but slow; at mainnet prices it is
hundreds of dollars. This is the honest quantification behind two decisions
already in the README: the graded demo runs on a **local deterministic
chain**, and a production deployment would batch evidence per certificate
family (or move it under a Merkle root per §4) before it would ever touch a
public network with real fees.

## Reproducing

```bash
bun run gas
```

The in-memory chain makes the numbers deterministic for a given commit;
the table above was captured on solc 0.8.28 / optimizer 200 runs.
