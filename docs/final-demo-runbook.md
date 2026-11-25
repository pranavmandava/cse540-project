# Final demo runbook (7–10 minutes)

The final deliverable is a recorded 7–10 minute demonstration: contract logic,
the full stakeholder workflow, and the analysis the report is built on. The
local chain is the recording path (deterministic, offline); the Base Sepolia
Worker URL is the clickable artifact you show for ten seconds and name in the
report — anyone can follow along without running anything.

## Before recording

```bash
bun run node                    # terminal 1
bun run seed:local              # terminal 2, fresh contract + dataset
cd web && bun run dev           # terminal 3, http://localhost:5173
```

- Optional but recommended: put a real Pinata JWT in `web/.dev.vars` so the
  upload step pins the mock REACH declaration (`docs/mock-reach-declaration-demo.pdf`)
  for real and the CID resolves on ipfs.io.
- MetaMask: chain `http://127.0.0.1:8545` (chain id 31337), keystores from
  `shared/keystores/` (blank password). Permit all accounts for the origin.
- Editor: two files only — `contracts/interfaces/IHBOMProvenance.sol` and
  `contracts/HBOMProvenance.sol`, 16px+ font.
- Have `docs/gas-analysis.md` open in a browser tab.

## The hosted cast (Base Sepolia, for the live URL)

The local demo has five funded accounts; the hosted deployment at
https://hbom-provenance.pranav-techiegeek.workers.dev is a two-actor play.
Import both throwaway keys from `.env` into MetaMask once (Add account →
Import private key — `DEPLOYER_PRIVATE_KEY`, then `AUDITOR_PRIVATE_KEY`):

| MetaMask account | On-chain roles | Plays |
| --- | --- | --- |
| Deployer (`0xdbCE…091A`) | ADMIN, SUPPLIER, ASSEMBLER, CUSTODIAN | supplier + assembler steps |
| Auditor (`0x7993…95ad`) | AUDITOR, CUSTODIAN | auditor + distributor steps |

Click **Connect wallet** on the site once — MetaMask switches to Base
Sepolia on its own prompt, and the header chip turns green ("Base Sepolia
84532"). The auditor account is deliberately a separate key: the
self-attestation revert and the two-pairs-of-eyes rule still hold on the
public chain.

Role switching works exactly like the local demo: header wallet chip →
**Switch account**, or MetaMask's own account menu; the app re-reads
`hasRole` and every screen follows. Expect one MetaMask confirmation per
write and ~2–4 s per receipt on the public chain — slower than the local
node, so do the six-step lifecycle locally and use the hosted URL as the
"anyone can verify this" beat (it needs no wallet at all).

Custody on the hosted site: the assembler (deployer account) initiates to
the auditor/distributor account, which accepts in a second transaction —
the auditor key was granted CUSTODIAN_ROLE so the handover can complete.

## Timing (target 8:30, acceptable 7:00–10:00)

| Time | Segment | On screen |
| --- | --- | --- |
| 0:00–0:45 | Problem | One slide or the README: fragmented tier records, no shared truth |
| 0:45–2:00 | Architecture | The diagram from the report: browser → Worker (RPC proxy, IPFS pinning) → contract; hashes on-chain, documents on IPFS |
| 2:00–3:00 | Contract logic | The two contract files: roles, `registerComponent`, `addCertificate`/`attestCertificate`, `verifyCompliance`, two-step custody |
| 3:00–6:15 | Live lifecycle | The six-step flow below |
| 6:15–7:15 | Gas analysis | `docs/gas-analysis.md`: certificates dominate; merkle saves 87% but loses gap enumeration; AccessControl costs +0.3% |
| 7:15–8:15 | Limits & honesty | What the chain does *not* prove; privacy; centralized comparison; the two-minute testnet URL |
| 8:15–8:30 | Close | Repo, report, team |

## The live lifecycle (row: working demonstration)

1. **Buyer (no wallet needed)** — `/` shows `AXIOM-WS-2026-SN-000418`
   **not compliant**, the gap `SSD-SAMSUNG-990PRO-2T-L2409:REACH`. Expand a
   component row to show certificate history and custody events.
2. **Supplier** — `/register`: pick the Samsung batch, attach the REACH
   declaration PDF. Say the keccak256 line: computed in the browser *before*
   anything is signed; the file is pinned to IPFS and the CID lands on-chain
   with the hash.
3. **Auditor** — `/audit`: the document is in the pending queue. Open the
   hash, re-verify, attest. Mention that self-attestation reverts on-chain.
4. **Buyer** — `/` again: badge flips to **compliant**, 18/18. "The badge is
   the contract's `verifyCompliance` answer, re-read after every transaction —
   not a field in a database."
5. **Assembler → Distributor** — `/custody`: initiate, switch account,
   accept. Two transactions, one audit trail.
6. **Wrong role** — `/register` as the auditor: the UI decodes
   `AccessControlUnauthorizedAccount(0x…, SUPPLIER_ROLE)`. Say once: "Every
   gate you just saw is a role check inside the contract, not in the web app."
7. **If time allows** — `/audit` revoke a certificate and flip the badge back
   on `/`. This is the strongest single beat for "the chain remembers";
   keep it if you are ahead at 6:00.

## Contract walkthrough (row: technical quality)

Open exactly two files. Anchor points:

- `IHBOMProvenance.sol` — four roles, the three structs, events with string
  ids unindexed (and why: no indexer in a course prototype), the eight writes.
- `HBOMProvenance.sol` — `verifyCompliance` (the exact-gap return that the
  buyer page renders verbatim), `attestCertificate` (separation of duties:
  double attestation and self-attestation revert), `initiateTransfer`/
  `acceptTransfer` (the recipient must already hold `CUSTODIAN_ROLE`, so a
  typo can't strand a board InTransit), and one custom error read aloud.

## Analysis segment (row: analytical depth)

Three numbers, one sentence each — they are all in `docs/gas-analysis.md`:

1. **Certificates dominate**: ~28.9M gas seeds the demo world; 69% is
   `addCertificate`. Redesign the evidence model, not the id keys.
2. **The merkle alternative** saves ~87% on assembly/verification but cannot
   answer "which document is missing" — we kept exact-gap enumeration because
   the buyer badge *is* the product.
3. **AccessControl costs +0.3% per gated call** over a flat mapping — cheap
   for a standardized, event-emitting governance trail.

Then the honesty block (the rubric rewards it): the chain proves document
integrity and custody order, not physical authenticity; off-chain IDs must be
bound to real-world parts by institutional process; and a centralized
registry would be cheaper but not mutually trusted — that tradeoff is the
whole reason the system exists. Name the live Worker URL + Base Sepolia
contract address here if deployed.

## Failure drill

Same as the interim: if the live flow breaks, reset with one `bun run
seed:local` and re-record the take. Do not splice. The chain is deterministic,
so a fresh seed reproduces the exact starting state every time.
