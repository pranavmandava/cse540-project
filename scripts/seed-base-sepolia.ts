/**
 * Deploys HBOMProvenance to Base Sepolia (chain 84532) and seeds the same
 * demo world as the local chain: the six workstation parts, their
 * certificates (minus the one deliberate REACH gap), and the board.
 *
 * Usage:
 *   1. Fund the DEPLOYER address from any Base Sepolia faucet (~0.05 test ETH).
 *   2. bun run seed:base
 *
 * Cast (two throwaway keys, .env / .env.example — never the local-dev keys):
 *   - deployer: admin + supplier + assembler + custodian (funds the auditor)
 *   - auditor: auditor + custodian, so they can attest evidence and receive
 *     the board without holding the supplier role
 *
 * Writes shared/deployments/84532.json; then `bun run deploy:web:base`
 * builds the client for this deployment and publishes it to Workers.
 */
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toHex } from "viem";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const AUDITOR_KEY = process.env.AUDITOR_PRIVATE_KEY;

if (!DEPLOYER_KEY || !AUDITOR_KEY) {
  throw new Error(
    "Set DEPLOYER_PRIVATE_KEY and AUDITOR_PRIVATE_KEY in .env (see .env.example). " +
      "Generate throwaway keys — never reuse the local-dev Hardhat keys on a public network.",
  );
}

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
const artifact = JSON.parse(
  readFileSync(join("artifacts", "contracts", "HBOMProvenance.sol", "HBOMProvenance.json"), "utf8"),
);

const deployerAccount = privateKeyToAccount(DEPLOYER_KEY as `0x${string}`);
const auditorAccount = privateKeyToAccount(AUDITOR_KEY as `0x${string}`);

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
const deployer = createWalletClient({ account: deployerAccount, chain: baseSepolia, transport: http(RPC_URL) });
const auditor = createWalletClient({ account: auditorAccount, chain: baseSepolia, transport: http(RPC_URL) });

async function send(
  client: typeof deployer,
  functionName: string,
  args: readonly unknown[],
) {
  const hash = await client.writeContract({
    address: contractAddress!,
    abi: artifact.abi,
    functionName,
    args,
    account: client.account,
    chain: baseSepolia,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${functionName} reverted on-chain (${receipt.transactionHash})`);
  }
  return receipt;
}

let contractAddress: `0x${string}` | null = null;

// ------------------------------------------------------------------- funding

const MIN_ETH = parseEther("0.0005");
const deployerBalance = await publicClient.getBalance({ address: deployerAccount.address });
if (deployerBalance < MIN_ETH) {
  throw new Error(
    `Deployer ${deployerAccount.address} holds ${deployerBalance} wei. ` +
      "Fund it from a faucet (the Coinbase CDP faucet drips 0.0001 ETH per claim; " +
      "~15 claims is plenty — the script also pays for the auditor).",
  );
}

const auditorBalance = await publicClient.getBalance({ address: auditorAccount.address });
if (auditorBalance < MIN_ETH) {
  console.log(`Funding auditor ${auditorAccount.address} with 0.0005 test ETH from the deployer...`);
  const hash = await deployer.sendTransaction({
    to: auditorAccount.address,
    value: parseEther("0.0005"),
    account: deployerAccount,
    chain: baseSepolia,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

console.log(`RPC:            ${RPC_URL}`);
console.log(`Deployer/admin: ${deployerAccount.address} (${deployerBalance / 10n ** 18n} ETH)`);
console.log(`Auditor:        ${auditorAccount.address} (${auditorBalance / 10n ** 18n} ETH)`);

// -------------------------------------------------------------------- deploy

console.log("\nDeploying HBOMProvenance...");
let deployReceipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
{
  const hash = await deployer.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [deployerAccount.address],
    account: deployerAccount,
    chain: baseSepolia,
  });
  deployReceipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!deployReceipt.contractAddress) throw new Error("Deployment produced no address.");
  contractAddress = deployReceipt.contractAddress;
}
console.log(`  address ${contractAddress}`);

async function grantRole(roleName: string, account: `0x${string}`) {
  const roleHash = keccak256(toHex(roleName));
  await send(deployer, "grantRole", [roleHash, account]);
  console.log(`  ${roleName.padEnd(15)} -> ${account}`);
}

console.log("Granting roles...");
await grantRole("SUPPLIER_ROLE", deployerAccount.address);
await grantRole("ASSEMBLER_ROLE", deployerAccount.address);
await grantRole("AUDITOR_ROLE", auditorAccount.address);
await grantRole("CUSTODIAN_ROLE", deployerAccount.address);
await grantRole("CUSTODIAN_ROLE", auditorAccount.address);

// ------------------------------------------------------------------- dataset

const partById = new Map(demo.parts.map((part) => [part.componentId, part]));
const boardParts = demo.board.componentIds.map((id) => partById.get(id)).filter(Boolean) as Part[];

const CERT_BODIES: Record<number, string> = {
  0: "RoHS 3 (EU 2015/863) declaration of conformity",
  1: "REACH SVHC declaration, candidate list 2026-06",
  2: "FCC Part 15 Subpart B unintentional radiator test report",
};

function docHash(body: string) {
  return keccak256(toHex(body));
}

function fakeCid(body: string) {
  return `bafybei${docHash(body).slice(2, 48)}`;
}

console.log(`\nRegistering the ${boardParts.length} board components...`);
for (const part of boardParts) {
  const body = `${part.name} — ${part.spec} (${part.category})`;
  await send(deployer, "registerComponent", [part.componentId, docHash(body), fakeCid(body)]);
}

console.log("Uploading and attesting compliance documents...");
let nextCertId = 1n;
let certCount = 0;
for (const part of boardParts) {
  for (const certType of [0, 1, 2] as const) {
    const isGap =
      part.componentId === demo.board.missingCert.componentId &&
      certType === demo.board.missingCert.certType;
    if (isGap) continue;

    const body = `${part.componentId} :: ${CERT_BODIES[certType]}`;
    await send(deployer, "addCertificate", [part.componentId, certType, docHash(body), fakeCid(body)]);
    await send(auditor, "attestCertificate", [nextCertId]);
    nextCertId += 1n;
    certCount += 1;
  }
}
console.log(`  ${certCount} certificates attested`);

console.log(`Assembling board ${demo.board.boardId}...`);
await send(deployer, "assembleHBOM", [demo.board.boardId, demo.board.componentIds]);

const [compliant, missing] = await publicClient.readContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "verifyCompliance",
  args: [demo.board.boardId],
}) as readonly [boolean, readonly string[]];

// ------------------------------------------------------------------ exports

const outDir = join("shared", "deployments");
mkdirSync(outDir, { recursive: true });

const deployment = {
  contractName: "HBOMProvenance",
  chainId: 84532,
  address: contractAddress,
  deployedAt: new Date().toISOString(),
  deployBlock: Number(deployReceipt.blockNumber),
  deployer: deployerAccount.address,
  roles: {
    admin: deployerAccount.address,
    supplier: deployerAccount.address,
    assembler: deployerAccount.address,
    auditor: auditorAccount.address,
    custodian: auditorAccount.address,
  },
  demo: {
    boardId: demo.board.boardId,
    componentIds: demo.board.componentIds,
    expected: { compliant, missing: [...missing] },
  },
  abi: artifact.abi,
};

const outPath = join(outDir, "84532.json");
writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(`
Seed complete.
  contract      ${contractAddress}
  board         ${demo.board.boardId}  compliant: ${compliant}${missing.length ? `  missing: ${missing.join(", ")}` : ""}
  certificates  ${certCount} attested (the demo gap is intact)

Wrote ${outPath}
Next: bun run deploy:web:base   # build the client for 84532 and deploy the Worker
`);
