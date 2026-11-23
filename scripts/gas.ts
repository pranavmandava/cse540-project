/**
 * Gas measurement for HBOMProvenance and its storage-design alternatives.
 *
 * Usage:
 *   bun run gas                      # in-memory network, deterministic numbers
 *
 * Produces a markdown table on stdout: every write path of the main contract,
 * the view paths the buyer-facing screens call, and the three bench
 * contracts in contracts/bench/GasBench.sol that price the alternatives
 * discussed in docs/gas-analysis.md (bytes32 ids, a Merkle-root HBOM, flat
 * role checks).
 *
 * Method: every write is a real transaction on Hardhat's in-memory chain;
 * numbers are receipt.gasUsed, so intrinsic cost and the role-check overhead
 * are included. Views are eth_estimateGas on an eth_call, which is what
 * another contract would pay — off-chain callers read them for free, and the
 * numbers are a complexity signal, not a fee.
 */
import { network } from "hardhat";
import { concat, keccak256, pad, toHex } from "viem";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const connection = await network.create();
const { viem } = connection;

const publicClient = await viem.getPublicClient();
const [admin, supplier, assembler, auditor, distributor] = await viem.getWalletClients();

if (!distributor) throw new Error("Expected at least 5 funded accounts on this network.");

type Wallet = NonNullable<typeof supplier>;
type Receipt = Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
type Target = { address: `0x${string}`; abi: unknown[] };

function artifact(rel: string) {
  return JSON.parse(readFileSync(rel, "utf8"));
}

const mainArtifact = artifact(join("artifacts", "contracts", "HBOMProvenance.sol", "HBOMProvenance.json"));

// ------------------------------------------------------------------ helpers

const rows: { op: string; gas: bigint; note: string }[] = [];

function record(op: string, receipt: Receipt, note: string) {
  rows.push({ op, gas: receipt.gasUsed, note });
}

async function send(wallet: Wallet, target: Target, functionName: string, args: readonly unknown[]) {
  const hash = await wallet.writeContract({
    address: target.address,
    abi: target.abi,
    functionName,
    args,
  });
  return publicClient.waitForTransactionReceipt({ hash });
}

async function deploy(artifactJson: { abi: unknown[]; bytecode: `0x${string}` }, args: readonly unknown[]) {
  const deployer = admin as Wallet;
  const hash = await deployer.deployContract({
    abi: artifactJson.abi,
    bytecode: artifactJson.bytecode,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Deployment produced no contract address.");
  return { receipt, target: { address: receipt.contractAddress, abi: artifactJson.abi } as Target };
}

async function measureRead(
  op: string,
  target: Target,
  functionName: string,
  args: readonly unknown[],
  note: string,
) {
  const gas = await publicClient.estimateContractGas({
    address: target.address,
    abi: target.abi,
    functionName,
    args,
    account: (admin as Wallet).account.address,
  });
  rows.push({ op, gas, note });
}

/** Component id of an exact length, e.g. idOf(31) -> "BENCH-" + 25 chars. */
function idOf(len: number, tag: string) {
  const prefix = `BENCH-${tag}-`;
  return `${prefix}${"A".repeat(Math.max(len - prefix.length, 0))}`;
}

const HASH = `0x${"11".repeat(32)}` as const;
const CID = "bafybenchcid01";

const main = await deploy(mainArtifact, [(admin as Wallet).account.address]);
record("deploy HBOMProvenance", main.receipt, "constructor + DEFAULT_ADMIN grant");

// -------------------------------------------------- main: role administration

async function grant(roleName: string, wallet: Wallet, op: string, note: string) {
  const roleHash = await publicClient.readContract({
    address: main.target.address,
    abi: main.target.abi,
    functionName: roleName,
  });
  const receipt = await send(admin as Wallet, main.target, "grantRole", [roleHash, wallet.account.address]);
  record(op, receipt, note);
}

await grant("SUPPLIER_ROLE", supplier as Wallet, "grantRole", "per-holder cost is flat: OZ v5 stores the role admin lazily, so a role's first holder costs the same as later ones");
await grant("SUPPLIER_ROLE", distributor as Wallet, "grantRole", "second holder of the same role (confirms the flat cost)");
await grant("ASSEMBLER_ROLE", assembler as Wallet, "grantRole", "first holder of ASSEMBLER");
await grant("AUDITOR_ROLE", auditor as Wallet, "grantRole", "first holder of AUDITOR");
await grant("CUSTODIAN_ROLE", assembler as Wallet, "grantRole", "first holder of CUSTODIAN");
await grant("CUSTODIAN_ROLE", distributor as Wallet, "grantRole", "second holder of CUSTODIAN");

// ------------------------------------------- main: register (id-length sweep)

const id10 = idOf(10, "10");
const id20 = idOf(20, "20");
const id31 = idOf(31, "31");
const id40 = idOf(40, "40");

for (const [id, note] of [
  [id10, "10-char id: string fits one slot"] as const,
  [id20, "20-char id: one data slot"] as const,
  [id31, "31-char id: one data slot, full"] as const,
  [id40, "40-char id: two data slots"] as const,
]) {
  const receipt = await send(supplier as Wallet, main.target, "registerComponent", [id, HASH, CID]);
  record("registerComponent", receipt, note);
}

// --------------------------------------------- main: certificate append growth

// The same component takes RoHS, REACH, FCC in turn; the append position
// shows how the per-component index grows.
for (const [certType, note] of [
  [0, "append position 1 (new array slot)"] as const,
  [1, "append position 2"] as const,
  [2, "append position 3"] as const,
]) {
  const receipt = await send(supplier as Wallet, main.target, "addCertificate", [id20, certType, HASH, CID]);
  record("addCertificate", receipt, note);
}

{
  const certs = await publicClient.readContract({
    address: main.target.address,
    abi: main.target.abi,
    functionName: "getComponentCertificates",
    args: [id20],
  });
  const rohsId = certs[0].id;

  const attested = await send(auditor as Wallet, main.target, "attestCertificate", [rohsId]);
  record("attestCertificate", attested, "two flag SSTOREs + timestamp");

  const revoked = await send(auditor as Wallet, main.target, "revokeCertificate", [certs[2].id, "bench"]);
  record("revokeCertificate", revoked, "single flag SSTORE, reason in the event only");
}

// --------------------------------------------------- main: assembleHBOM scale

const prepIds = Array.from({ length: 12 }, (_, i) => idOf(20, `P${i.toString().padStart(2, "0")}`));
for (const id of prepIds) {
  await send(supplier as Wallet, main.target, "registerComponent", [id, HASH, CID]);
}

for (const count of [1, 6, 16]) {
  const ids = count === 1 ? [id10] : count === 6 ? [id10, id20, id31, id40, ...prepIds.slice(0, 2)] : [id10, id20, id31, id40, ...prepIds];
  const receipt = await send(assembler as Wallet, main.target, "assembleHBOM", [
    `BENCH-BOARD-${count.toString().padStart(2, "0")}`,
    ids,
  ]);
  record("assembleHBOM", receipt, `${count} component${count === 1 ? "" : "s"}, O(n^2) duplicate check`);
}

// ------------------------------------------------------------ main: custody

{
  const board = "BENCH-BOARD-06";
  const initiated = await send(assembler as Wallet, main.target, "initiateTransfer", [board, distributor!.account.address]);
  record("initiateTransfer", initiated, "pendingCustodian + state SSTOREs");

  const accepted = await send(distributor as Wallet, main.target, "acceptTransfer", [board]);
  record("acceptTransfer", accepted, "custodian swap + state reset");

  const board1 = "BENCH-BOARD-01";
  await send(assembler as Wallet, main.target, "initiateTransfer", [board1, distributor!.account.address]);
  const cancelled = await send(assembler as Wallet, main.target, "cancelTransfer", [board1]);
  record("cancelTransfer", cancelled, "clear pendingCustodian, reset state");
}

// ------------------------------------------- main: views on an attested world

// Six components, each with three attested certificates, assembled into
// BENCH-VIEW-06; a 16-component variant and a one-gap variant follow.
function fullPrep(tag: string, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = idOf(20, `${tag}${i.toString().padStart(2, "0")}`);
    ids.push(id);
  }
  return ids;
}

async function buildAttested(ids: string[], boardId: string, gapIndex = -1) {
  for (const id of ids) {
    await send(supplier as Wallet, main.target, "registerComponent", [id, HASH, CID]);
    const certs: bigint[] = [];
    for (const certType of [0, 1, 2] as const) {
      await send(supplier as Wallet, main.target, "addCertificate", [id, certType, HASH, CID]);
      const list = await publicClient.readContract({
        address: main.target.address,
        abi: main.target.abi,
        functionName: "getComponentCertificates",
        args: [id],
      });
      certs.push(list[list.length - 1].id);
    }
    // The gap component keeps its REACH certificate unattested.
    for (const [i, certId] of certs.entries()) {
      if (gapIndex >= 0 && ids.indexOf(id) === gapIndex && i === 1) continue;
      await send(auditor as Wallet, main.target, "attestCertificate", [certId]);
    }
  }
  await send(assembler as Wallet, main.target, "assembleHBOM", [boardId, ids]);
}

const view6 = fullPrep("V6", 6);
await buildAttested(view6, "BENCH-VIEW-06");
const view16 = fullPrep("W6", 16);
await buildAttested(view16, "BENCH-VIEW-16");
await buildAttested(fullPrep("VG", 6), "BENCH-VIEW-GAP", 0);

await measureRead("getComponent (view)", main.target, "getComponent", [id20], "one struct read");
await measureRead("getBoardComponents (view)", main.target, "getBoardComponents", ["BENCH-VIEW-06"], "6 string ids copied to memory");
await measureRead("verifyCompliance (view)", main.target, "verifyCompliance", ["BENCH-VIEW-06"], "6 components x 3 cert types, all attested");
await measureRead("verifyCompliance (view)", main.target, "verifyCompliance", ["BENCH-VIEW-16"], "16 components x 3 cert types, all attested");
await measureRead("verifyCompliance (view)", main.target, "verifyCompliance", ["BENCH-VIEW-GAP"], "6 components, one unattested REACH gap");
await measureRead("getBoardLineage (view)", main.target, "getBoardLineage", ["BENCH-VIEW-06"], "board + 6 components + 18 certificates");

// ------------------------------------------------------------------- benches

const bytes32Artifact = artifact(join("artifacts", "contracts", "bench", "GasBench.sol", "Bytes32Bench.json"));
const merkleArtifact = artifact(join("artifacts", "contracts", "bench", "GasBench.sol", "MerkleBench.json"));
const flatArtifact = artifact(join("artifacts", "contracts", "bench", "GasBench.sol", "FlatRoleBench.json"));

// --- Alternative C: flat role mapping vs OpenZeppelin AccessControl -------
{
  const flat = await deploy(flatArtifact, []);
  const enroll = await send(admin as Wallet, flat.target, "enroll", [supplier!.account.address]);
  record("FlatRoleBench.enroll", enroll, "vs grantRole: one bool SSTORE, no admin branch, no event");
  const reg = await send(supplier as Wallet, flat.target, "register", [id20, HASH, CID]);
  record("FlatRoleBench.register", reg, "vs registerComponent (20-char): same writes, flat role check");
}

// --- Alternative A: bytes32 ids vs strings -------------------------------
{
  const bench = await deploy(bytes32Artifact, []);
  const id = pad(toHex(id31), { size: 32 });
  const reg = await send(admin as Wallet, bench.target, "register", [id, HASH, CID]);
  record("Bytes32Bench.register", reg, "vs registerComponent (31-char): id in one slot, no string copy");

  const ids = [id, id, id, id, id, id].map((_, i) => pad(toHex(idOf(20, `B${i}`)), { size: 32 }));
  for (const benchId of ids) {
    await send(admin as Wallet, bench.target, "register", [benchId, HASH, CID]);
  }
  const boardId = pad(toHex("BENCH-B32-BOARD-06"), { size: 32 });
  const asm = await send(admin as Wallet, bench.target, "assemble", [boardId, ids]);
  record("Bytes32Bench.assemble", asm, "vs assembleHBOM (6): word ids, word comparison, same O(n^2)");
}

// --- Alternative B: one Merkle root per board -----------------------------
{
  const bench = await deploy(merkleArtifact, []);

  /** Non-sorted pairwise tree: parent = keccak256(left ++ right). */
  function treeRoot(leaves: `0x${string}`[], index: number) {
    let level = leaves;
    let target = index;
    const proof: `0x${string}`[] = [];
    while (level.length > 1) {
      const next: `0x${string}`[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] ?? level[i];
        next.push(keccak256(concat([left, right])));
      }
      proof.push(level[target % 2 === 0 ? target + 1 : target - 1] ?? level[target]);
      level = next;
      target = Math.floor(target / 2);
    }
    return { root: level[0], proof };
  }

  const leaves6 = view6.map((id) => keccak256(toHex(`${id}:RoHS:attested`)));
  const { root: root6, proof: proof6 } = treeRoot(leaves6, 0);
  const boardId6 = pad(toHex("BENCH-MERKLE-06"), { size: 32 });
  const asm = await send(admin as Wallet, bench.target, "assemble", [boardId6, root6]);
  record("MerkleBench.assemble", asm, "vs assembleHBOM (6): one root SSTORE, no per-component state");

  await measureRead(
    "MerkleBench.verify (view)",
    bench.target,
    "verify",
    [boardId6, leaves6[0], proof6],
    "vs verifyCompliance (6): 3-node proof walk, no storage scans",
  );

  const leaves16 = view16.map((id) => keccak256(toHex(`${id}:RoHS:attested`)));
  const { root: root16, proof: proof16 } = treeRoot(leaves16, 0);
  const boardId16 = pad(toHex("BENCH-MERKLE-16"), { size: 32 });
  await send(admin as Wallet, bench.target, "assemble", [boardId16, root16]);
  await measureRead(
    "MerkleBench.verify (view)",
    bench.target,
    "verify",
    [boardId16, leaves16[0], proof16],
    "4-node proof walk for a 16-leaf HBOM",
  );
}

// -------------------------------------------------------------------- totals

// Composed cost of the seeded demo world: 30 registerComponent (31-char),
// 89 addCertificate (average of positions 1-3) + 89 attestCertificate, and
// one 6-component assembleHBOM. Composed from the measured rows above.
function findGas(op: string, note: string) {
  const row = rows.find((r) => r.op === op && r.note.startsWith(note));
  if (!row) throw new Error(`Measured row not found: ${op} / ${note}`);
  return row.gas;
}

const reg31 = findGas("registerComponent", "31-char");
const certAvg = (findGas("addCertificate", "append position 1") +
  findGas("addCertificate", "append position 2") +
  findGas("addCertificate", "append position 3")) / 3n;
const attest = findGas("attestCertificate", "two flag");
const assemble6 = findGas("assembleHBOM", "6 components");

const seedTotal = 30n * reg31 + 89n * certAvg + 89n * attest + assemble6;
rows.push({
  op: "seed the demo world (computed)",
  gas: seedTotal,
  note: "30 registers + 89 (addCertificate + attestCertificate) + 1 assemble(6)",
});

// ------------------------------------------------------------------- output

console.log("| Operation | Gas | Notes |");
console.log("| --- | ---: | --- |");
for (const row of rows) {
  console.log(`| ${row.op} | ${row.gas.toLocaleString("en-US")} | ${row.note} |`);
}

const at20gwei = (gas: bigint) => Number(gas * 20n) / 1e9;
console.log(`\nContext: seeding the demo world costs ~${seedTotal.toLocaleString("en-US")} gas = ${at20gwei(seedTotal).toFixed(4)} ETH at 20 gwei.`);
console.log("Run against the in-memory chain; numbers are deterministic for this commit.");
