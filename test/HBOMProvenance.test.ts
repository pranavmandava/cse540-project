import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [admin, supplier, assembler, auditor, distributor] = await viem.getWalletClients();

type Wallet = NonNullable<typeof supplier>;

const ROLES = ["SUPPLIER_ROLE", "ASSEMBLER_ROLE", "AUDITOR_ROLE", "CUSTODIAN_ROLE"] as const;

const HASH = `0x${"11".repeat(32)}` as const;

let contract: Awaited<ReturnType<typeof viem.deployContract<"HBOMProvenance">>>;

async function send(wallet: Wallet, functionName: string, args: readonly unknown[] = []) {
  const hash = await wallet.writeContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function grant(role: (typeof ROLES)[number], wallet: Wallet) {
  const roleHash = await contract.read[role]();
  await send(admin as Wallet, "grantRole", [roleHash, wallet.account.address]);
}

async function register(componentId = "MCU-TEST-001") {
  await send(supplier as Wallet, "registerComponent", [componentId, HASH, "bafytest"]);
  return componentId;
}

async function addCert(componentId: string, certType: 0 | 1 | 2) {
  await send(supplier as Wallet, "addCertificate", [componentId, certType, HASH, "bafytest"]);
  const certs = await contract.read.getComponentCertificates([componentId]);
  return certs[certs.length - 1].id;
}

async function attest(certId: bigint) {
  await send(auditor as Wallet, "attestCertificate", [certId]);
}

async function assembleAll(componentIds: string[], boardId = "BOARD-TEST-001") {
  await send(assembler as Wallet, "assembleHBOM", [boardId, componentIds]);
  return boardId;
}

describe("HBOMProvenance", () => {
  beforeEach(async () => {
    contract = await viem.deployContract("HBOMProvenance", [admin.account.address]);
    await grant("SUPPLIER_ROLE", supplier as Wallet);
    await grant("ASSEMBLER_ROLE", assembler as Wallet);
    await grant("AUDITOR_ROLE", auditor as Wallet);
    await grant("CUSTODIAN_ROLE", assembler as Wallet);
    await grant("CUSTODIAN_ROLE", distributor as Wallet);
  });

  it("happy path: registered, attested evidence makes a board compliant", async () => {
    const componentId = await register();
    for (const type of [0, 1, 2] as const) {
      await attest(await addCert(componentId, type));
    }

    const [compliant, missing] = await contract.read.verifyCompliance([
      await assembleAll([componentId]),
    ]);

    assert.equal(compliant, true);
    assert.deepEqual(missing, []);
  });

  it("unauthorized action: a non-supplier cannot register a batch", async () => {
    await assert.rejects(
      send(assembler as Wallet, "registerComponent", ["MCU-TEST-002", HASH, "bafytest"]),
      /AccessControlUnauthorizedAccount/,
    );
  });

  it("duplicate id: the same batch cannot be registered twice", async () => {
    await register("MCU-TEST-003");
    await assert.rejects(
      send(supplier as Wallet, "registerComponent", ["MCU-TEST-003", HASH, "bafytest"]),
      /AlreadyExists/,
    );
  });

  it("missing evidence: an unattested certificate does not satisfy compliance", async () => {
    const componentId = await register();
    await attest(await addCert(componentId, 0)); // RoHS is fully attested
    await addCert(componentId, 1); // REACH uploaded but never reviewed
    // FCC never uploaded at all.
    const boardId = await assembleAll([componentId]);

    const [compliant, missing] = await contract.read.verifyCompliance([boardId]);

    assert.equal(compliant, false);
    assert.deepEqual([...missing], [`${componentId}:REACH`, `${componentId}:FCC`]);
  });

  it("invalid transfer: recipient needs the custodian role and cannot be the sender", async () => {
    const boardId = await assembleAll([await register()]);

    await assert.rejects(
      send(assembler as Wallet, "initiateTransfer", [boardId, supplier.account.address]),
      /InvalidAddress/,
    );
    await assert.rejects(
      send(assembler as Wallet, "initiateTransfer", [boardId, assembler.account.address]),
      /SelfTransfer/,
    );
  });

  it("two-step handover: only the nominated recipient can accept", async () => {
    const boardId = await assembleAll([await register()]);
    await send(assembler as Wallet, "initiateTransfer", [boardId, distributor.account.address]);

    await assert.rejects(
      send(supplier as Wallet, "acceptTransfer", [boardId]),
      /AccessControlUnauthorizedAccount/,
    );

    await send(distributor as Wallet, "acceptTransfer", [boardId]);
    const board = await contract.read.getBoard([boardId]);

    assert.equal(board.custodian.toLowerCase(), distributor.account.address.toLowerCase());
    assert.equal(board.state, 1); // InCustody
  });

  it("double attestation is rejected and self-attestation is impossible", async () => {
    const componentId = await register();
    const certId = await addCert(componentId, 0);

    await attest(certId);
    await assert.rejects(
      send(auditor as Wallet, "attestCertificate", [certId]),
      /AlreadyAttested/,
    );

    // Make the auditor the uploader, then try to attest their own document.
    await grant("SUPPLIER_ROLE", auditor as Wallet);
    await send(auditor as Wallet, "registerComponent", ["MCU-SELF-001", HASH, "bafytest"]);
    await send(auditor as Wallet, "addCertificate", ["MCU-SELF-001", 1, HASH, "bafytest"]);
    const own = await contract.read.getComponentCertificates(["MCU-SELF-001"]);

    await assert.rejects(
      send(auditor as Wallet, "attestCertificate", [own[0].id]),
      /SelfAttestation/,
    );
  });

  it("revocation keeps the record but removes it from compliance", async () => {
    const componentId = await register();
    const certs: bigint[] = [];
    for (const type of [0, 1, 2] as const) {
      const certId = await addCert(componentId, type);
      await attest(certId);
      certs.push(certId);
    }
    const boardId = await assembleAll([componentId]);
    assert.equal((await contract.read.verifyCompliance([boardId]))[0], true);

    await send(auditor as Wallet, "revokeCertificate", [certs[1], "SVHC list expired"]);

    const [compliant, missing] = await contract.read.verifyCompliance([boardId]);
    assert.equal(compliant, false);
    assert.deepEqual([...missing], [`${componentId}:REACH`]);

    const cert = await contract.read.getCertificate([certs[1]]);
    assert.equal(cert.revoked, true);
    assert.equal(cert.attested, true);
  });
});
