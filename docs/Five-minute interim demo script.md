
**Project:** Electronics HBOM Provenance and Compliance  
**Group:** 18  

## 0:00–0:25 — Introduction

**On screen:** Slide 1 — Title

**Suhas:**

> Hello. We're Group 18, and our project is an electronics hardware bill of materials, or HBOM, provenance and compliance system.
>
> Our goal is to make it easier to track the components used in an electronics product and verify whether the required compliance documents have been reviewed.

*[Advance to slide 2.]*

## 0:25–1:10 — Project status

**On screen:** Slide 2 — Where We Are

**Pradeep:**

> So far, we've implemented the smart contract, a web application, and a sample dataset for our demonstration.
>
> The contract supports different stakeholder roles. Suppliers can register component batches and add documents, auditors can attest those documents, and assemblers can link components to a finished board.
>
> We've also implemented compliance verification and a two-step custody transfer. Our contract test suite currently has eight passing tests.
>
> For the demo, we're running everything on a local blockchain. The app can calculate a document's hash, but uploading documents to IPFS is still in progress. Testnet deployment, gas and privacy analysis, and the final report are still ahead of us.

*[Advance to slide 3.]*

## 1:10–1:30 — How the system fits together

**On screen:** Slide 3 — Architecture

**Varshini:**

> At a high level, the user connects a wallet to the web app and interacts with the smart contract.
>
> The contract keeps track of component batches, document hashes, auditor attestations, and board records. The app reads that information back and shows whether a board meets the required compliance checks.
>
> We'll now demonstrate that process with a board that starts out missing one certificate.

*[Advance to slide 4, then switch to the web app.]*

## 1:30–3:25 — Live compliance demo

**On screen:** Web app at http://localhost:5173

**Pranav:**

> This is our sample workstation board. It contains six component batches, and the contract checks each one for the required RoHS, REACH, and FCC evidence.

*[Show the board's compliance result and the missing evidence.]*

> Right now, the board is marked **not compliant**. The app shows us the exact gap: the Samsung SSD is missing its REACH certificate.
>
> I'll switch to the supplier account and add that document.

*[Switch to the supplier account. Open the registration screen, select the Samsung SSD batch, choose REACH, and select the document.]*

> Before I submit it, the app calculates a hash of the file. That hash provides a way to check the document's integrity later. We're not claiming that the hash alone proves the document is authentic.

*[Submit the transaction and confirm it in MetaMask.]*

> The document is now recorded, but adding it alone is not enough to make the board compliant. An auditor still needs to review and attest it.
>
> I'll switch to the auditor account.

*[Switch to the auditor account. Open the audit screen and attest the pending document. Confirm the transaction.]*

> Now that the auditor has attested the REACH document, I'll return to the board.

*[Return to the verification screen and show the updated result.]*

> The board is now marked **compliant**, and the missing evidence is cleared. This result comes from the contract's compliance check, rather than a status that we manually set in the interface.
>
> That completes the workflow: the supplier adds evidence, the auditor attests it, and anyone checking the board can see the updated result.

*[Switch to the contract file on GitHub.]*

## 3:25–4:35 — High-level contract walkthrough

**On screen:** GitHub page for `contracts/HBOMProvenance.sol`

**Varshini:**

> Here is the Solidity contract behind the workflow we just showed. We'll focus on the main functions involved rather than going through the entire file.

*[Find and show `attestCertificate`.]*

> First, `attestCertificate` lets an authorized auditor attest a document. The contract also prevents someone from attesting their own upload, which helps separate the supplier's and auditor's responsibilities.

*[Find and show `verifyCompliance`.]*

> Next, `verifyCompliance` checks the components linked to a board. It looks for the required certificates and checks that they have been attested and not revoked.
>
> If something is missing, the function returns the specific gap. That's why the app could tell us that the SSD was missing REACH evidence, and then show the board as compliant after the auditor's transaction.

*[Optionally point to role checks near the shown functions.]*

> The contract also checks which role an account has before allowing protected actions. For example, adding evidence and attesting it are assigned to different participants.

## 4:35–5:00 — Closing

**On screen:** Return to the app, or keep the contract visible

**Tushar:**

> To summarize, we've built a working local prototype that connects component records, compliance documents, and stakeholder actions.
>
> The demo showed how a missing certificate can be added and reviewed before the board passes its compliance check. Next, we plan to continue the IPFS integration, deploy to a test network, and complete our analysis and final report.
>
> Thank you!

## Before recording

- Seed the local chain again so the SSD starts with the missing REACH certificate.
- Have a sample document ready and the supplier and auditor accounts available in MetaMask.
- Open the slides, app, and GitHub contract page beforehand.
- Rehearse with the actual wallet confirmation times; shorten transitions if the recording approaches 5 minutes 30 seconds.
