# Interim demo runbook

Five minutes. Four slides (`docs/slides.html`), one workflow, one contract file on screen.
The slides are a backdrop; the demo and the contract code carry the score.

## Before recording

```bash
bun run node                 # terminal 1, leave it running
bun run seed:local           # terminal 2, fresh contract + dataset
cd web && bun run dev        # terminal 3, http://localhost:5173
```

- Reseed immediately before recording (~9 s). The chain is deterministic: 30 parts,
  one six-part workstation, one gap.
- MetaMask: network `http://127.0.0.1:8545`, chain id `31337`; import the five files in
  `shared/keystores/` (Add wallet → Private key → JSON File, blank password).
- Role switching: wallet chip → **Switch account**, or MetaMask's own account menu.
  Permit all five accounts for `localhost:5173` once so no switch needs re-approval.
- Slide deck: `docs/slides.html` in a separate window, `F` for fullscreen. Four slides:
  title, where we are, architecture, live demo. Press `N` only when rehearsing.
- Terminal: font 16 px+, editor zoom so `HBOMProvenance.sol` is readable at 1080p.
- Turn off Dark Reader for `localhost`. Browser zoom 110–125%. Close Slack.

## Timing (target 5:00, acceptable 4:30–5:30)

| Time | Segment | On screen |
| --- | --- | --- |
| 0:00–0:20 | Title | Slide 1 |
| 0:20–1:00 | Where we are | Slide 2: finished / in progress / remaining |
| 1:00–1:15 | Architecture | Slide 3: browser → app → contract |
| 1:15–3:15 | Live demo | Slide 4, then the browser |
| 3:15–4:35 | Contract code | `HBOMProvenance.sol` and its interface only |
| 4:35–5:00 | Close | Back to the app, no slide needed |

## Slide 2 — where we are (row 1)

- **Finished** — contract: four roles, eight write functions, custom errors, indexed
  events. 8-case test suite. Five-screen client on TanStack Start. Seed: 30 real PC
  parts, 89 attested certificates, one deliberate gap.
- **In progress** — IPFS upload: keccak256 is computed and stored on chain today, CIDs
  are placeholders. Reviewer pass on copy. Gas capture.
- **Remaining** — Base Sepolia and a live Workers URL, gas/privacy analysis, final
  report and cold-clone demo.

## Slide 4 — demo path (row 2)

1. `/` as anyone: `AXIOM-WS-2026-SN-000418` is **not compliant**, one gap:
   `SSD-SAMSUNG-990PRO-2T-L2409:REACH`. Expand a row to show certificate history.
2. `/register` as **supplier**: pick the Samsung 990 Pro batch, type REACH, choose a PDF.
   Point out the keccak256 appears before anything is signed.
3. `/audit` as **auditor**: the document is pending. Attest it.
4. `/` again: badge flips to **compliant**, counters go to 18 / 0 gaps.
5. `/custody` as **assembler**: offer to the distributor. Switch account, accept.
6. `/register` as **assembler**: submit anything, show the decoded revert
   `AccessControlUnauthorizedAccount(0x…, SUPPLIER)`.

Say once: "The badge is not a dashboard field; it is the contract's `verifyCompliance`
answer, re-read after every transaction."

If you are behind at 3:00, drop step 6 (the revert). The workflow still satisfies the
rubric; the revert is a bonus.

## Contract walkthrough (row 3)

Open exactly two files. Do not tour the repo.

1. `contracts/interfaces/IHBOMProvenance.sol` (~20 s)
   - Four roles, one per participant type; structs for component, certificate, board.
   - Events carry the string ids unindexed: Solidity would otherwise store only
     `keccak256(id)`, and this prototype has no indexer to resolve it.
2. `contracts/HBOMProvenance.sol` (~60 s)
   - `attestCertificate` — auditor role, rejects double attestation and self-attestation.
   - `verifyCompliance` — walks each component's certificates, requires attested and
     not revoked, returns the exact gaps; that return value is the badge.
   - `initiateTransfer` / `acceptTransfer` — two-step, recipient must hold custodian.
3. Close the loop verbally (~10 s): the UI calls one function, the contract emits an
   event, the client replays events to rebuild the page. No backend, no database.

## What we deliberately skip

Mention only if asked; do not spend demo time on it.

- Real IPFS upload — the hash is the trust anchor; CIDs are placeholders.
- Testnet — the local node is deterministic and is the graded path.
- Gas table, version pointers, board enumeration, admin UI — final report or out of scope.
- Upgradeability and pause — not part of the evaluation.

## Failure drill

If the live demo breaks, stop and re-record the whole take. Do not splice. Keep the seed
command in a terminal so a reset is two keystrokes.
