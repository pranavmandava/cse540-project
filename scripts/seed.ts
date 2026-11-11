/**
 * One-command demo environment: deploys HBOMProvenance, enrols the five demo
 * participants, and loads the dataset used in the interim demo.
 *
 * Usage:
 *   bunx hardhat node                                       # terminal 1
 *   bunx hardhat run scripts/seed.ts --network localhost    # terminal 2
 *   bun run web                                             # terminal 3
 *
 * Part data comes from shared/demo-parts.json, curated from the public
 * docyx/pc-part-dataset (see the source block in that file). 30 real parts
 * across six categories form the supplier catalogue; one six-part workstation
 * is assembled from it.
 *
 * The seeded world is deliberately incomplete, so the demo has something to do:
 *   - 30 registered component batches with datasheets
 *   - 89 attested certificates (RoHS + REACH + FCC for everything except one)
 *   - 1 assembled board held by the assembler, NOT compliant
 *   - the single gap is the Samsung 990 Pro's REACH declaration
 *
 * Demo spine: supplier uploads the missing REACH certificate -> auditor attests
 * it -> buyer page flips to compliant -> custody moves to the distributor.
 */
import { network } from "hardhat";
import { keccak256, toHex } from "viem";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Part {
  category: string;
  componentId: string;
  name: string;
  spec: string;
  price: number;
}

interface PartFile {
  board: {
    boardId: string;
    componentIds: string[];
    missingCert: { componentId: string; certType: 0 | 1 | 2 };
  };
  parts: Part[];
}

const demo = JSON.parse(readFileSync(join("shared", "demo-parts.json"), "utf8")) as PartFile;

const connection = await network.create();
const { viem } = connection;

const publicClient = await viem.getPublicClient();
const [admin, supplier, assembler, auditor, distributor] = await viem.getWalletClients();

if (!distributor) throw new Error("Expected at least 5 funded accounts on this network.");

type Wallet = NonNullable<typeof supplier>;

/** Send a write as a specific demo participant and wait for the receipt. */
async function send(wallet: Wallet, functionName: string, args: readonly unknown[]) {
  const hash = await wallet.writeContract({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// ------------------------------------------------------------------ deploy

console.log("Deploying HBOMProvenance...");
const contract = await viem.deployContract("HBOMProvenance", [admin.account.address]);
console.log(`  address ${contract.address}`);

async function grantRole(
  roleName: "SUPPLIER_ROLE" | "ASSEMBLER_ROLE" | "AUDITOR_ROLE" | "CUSTODIAN_ROLE",
  account: Wallet,
) {
  const roleHash = await contract.read[roleName]();
  await send(admin as Wallet, "grantRole", [roleHash, account.account.address]);
}

console.log("Granting roles...");
await grantRole("SUPPLIER_ROLE", supplier as Wallet);
await grantRole("ASSEMBLER_ROLE", assembler as Wallet);
await grantRole("AUDITOR_ROLE", auditor as Wallet);
// The assembler physically holds the board first; the distributor receives it
// later in the demo, so both need CUSTODIAN_ROLE.
await grantRole("CUSTODIAN_ROLE", assembler as Wallet);
await grantRole("CUSTODIAN_ROLE", distributor as Wallet);

// ------------------------------------------------------------------ dataset

const CERT_TYPES = [0, 1, 2] as const;
const CERT_BODIES: Record<number, string> = {
  0: "RoHS 3 (EU 2015/863) declaration of conformity",
  1: "REACH SVHC declaration, candidate list 2026-06",
  2: "FCC Part 15 Subpart B unintentional radiator test report",
};

function docHash(body: string) {
  return keccak256(toHex(body));
}

/** Placeholder CID until the IPFS upload step lands; unique per document. */
function fakeCid(body: string) {
  return `bafybei${docHash(body).slice(2, 48)}`;
}

console.log(`Registering ${demo.parts.length} component batches...`);
for (const part of demo.parts) {
  const body = `${part.name} — ${part.spec} (${part.category})`;
  await send(supplier as Wallet, "registerComponent", [part.componentId, docHash(body), fakeCid(body)]);
}
console.log(`  ${demo.parts.length} batches: ${[...new Set(demo.parts.map((p) => p.category))].join(", ")}`);

console.log("Uploading and attesting compliance documents...");
let certCount = 0;
// `_nextCertId` starts at 1 on a fresh deployment and only the supplier writes,
// so the id is predictable and we avoid one read per document.
let nextCertId = 1n;

for (const part of demo.parts) {
  for (const certType of CERT_TYPES) {
    const isGap =
      part.componentId === demo.board.missingCert.componentId &&
      certType === demo.board.missingCert.certType;
    if (isGap) continue;

    const body = `${part.componentId} :: ${CERT_BODIES[certType]}`;
    await send(supplier as Wallet, "addCertificate", [
      part.componentId,
      certType,
      docHash(body),
      fakeCid(body),
    ]);
    await send(auditor as Wallet, "attestCertificate", [nextCertId]);
    nextCertId += 1n;
    certCount += 1;
  }
}
console.log(`  ${certCount} certificates attested`);

if (nextCertId !== 90n) throw new Error(`Expected 89 certificates, tracked ${nextCertId - 1n}`);

console.log(`Assembling board ${demo.board.boardId}...`);
await send(assembler as Wallet, "assembleHBOM", [demo.board.boardId, demo.board.componentIds]);

const [compliant, missing] = await contract.read.verifyCompliance([demo.board.boardId]);

// ------------------------------------------------------------------ exports

const chainId = await publicClient.getChainId();
const artifactPath = join("artifacts", "contracts", "HBOMProvenance.sol", "HBOMProvenance.json");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

const outDir = join("shared", "deployments");
mkdirSync(outDir, { recursive: true });

const deployment = {
  contractName: "HBOMProvenance",
  chainId,
  address: contract.address,
  deployedAt: new Date().toISOString(),
  deployer: admin.account.address,
  boardId: demo.board.boardId,
  roles: {
    admin: admin.account.address,
    supplier: supplier.account.address,
    assembler: assembler.account.address,
    auditor: auditor.account.address,
    custodian: distributor.account.address,
  },
  demo: {
    boardId: demo.board.boardId,
    componentIds: demo.board.componentIds,
    expected: { compliant, missing },
  },
  abi: artifact.abi,
};

const outPath = join(outDir, `${chainId}.json`);
writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(`
Seed complete.
  contract      ${contract.address}
  chain         ${chainId}
  board         ${demo.board.boardId}
  components    ${demo.parts.length} batches across ${new Set(demo.parts.map((p) => p.category)).size} categories
  certificates  ${certCount} attested
  compliant     ${compliant}${missing.length ? `  missing ${missing.join(", ")}` : ""}

Demo cast (keystores in shared/keystores/, or import the keys from hardhat node):
  admin         ${admin.account.address}
  supplier      ${supplier.account.address}
  assembler     ${assembler.account.address}
  auditor       ${auditor.account.address}
  distributor   ${distributor.account.address}

Wrote ${outPath}
Start the UI with:  cd web && bun run dev
`);
