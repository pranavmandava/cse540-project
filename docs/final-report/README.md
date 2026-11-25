# Final technical report

`report.tex` is the IEEE two-column technical report due Dec 4 (4–8 pages).
It is self-contained IEEEtran — paste it into a blank Overleaf project
(compiler: pdfLaTeX) and it compiles with no external figures or `.bib`
files.

## Where the numbers come from

Every gas figure in Section V is real, captured by `bun run gas`
(`scripts/gas.ts`) and mirrored with more detail in
[`../gas-analysis.md`](../gas-analysis.md). If the contract changes, rerun
the measurement and update both.

## Before submitting — team review checklist

- [ ] Read Section VI (Discussion) carefully: it states the system's
      boundaries (physical authenticity, admin trust root, pinning liveness,
      privacy). Everyone should be comfortable defending these live in Q&A.
- [x] Verify the abstract's claims still match the shipped contract.
- [x] If the Base Sepolia deployment is done, add the Worker URL and the
      contract address to the architecture paragraph in Section II-D
      (marked by the "optional shared deployment" sentence).
- [ ] Adjust author block emails/names if needed.
- [ ] One full read-aloud pass: IEEE reviewers penalize prose that reads
      assembled. Cut anything that does not carry information.
- [ ] Check the page count after Overleaf's first compile: aim for 5–7 pages
      including references.
