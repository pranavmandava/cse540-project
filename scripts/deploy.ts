/**
 * Deploys HBOMProvenance and enrols the five demo participants.
 *
 * Usage:
 *   bunx hardhat run scripts/deploy.ts                 # in-memory network, smoke test
 *   bunx hardhat node                                  # terminal 1
 *   bunx hardhat run scripts/deploy.ts --network localhost   # terminal 2
 *
 * Why this script grants roles instead of the constructor: role assignment then
 * appears as real transactions in the chain history, which is exactly the kind
 * of governance record the project is trying to demonstrate. It also lets the
 * grader see who received which role.
 *
 * Writes shared/deployments/<chainId>.json so the web app never hand-copies an
 * address or an ABI.
 */
import { network } from "hardhat";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const connection = await network.create();
const { viem } = connection;

const publicClient = await viem.getPublicClient();

// Hardhat's in-memory network funds 20 accounts. We use the first five as the
// course demo cast: admin, supplier, assembler, auditor, custodian.
const wallets = await viem.getWalletClients();
const [admin, supplier, assembler, auditor, custodian] = wallets;

if (admin === undefined || custodian === undefined) {
  throw new Error("Expected at least 5 funded accounts on this network.");
}

console.log("Deploying HBOMProvenance...");
const contract = await viem.deployContract("HBOMProvenance", [admin.account.address]);
console.log(`  address: ${contract.address}`);

// Role getters are public constants on the contract.
async function grantRole(roleName, account) {
  const roleHash = await contract.read[roleName]();
  const txHash = await contract.write.grantRole([roleHash, account.account.address]);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`  ${roleName.padEnd(15)} -> ${account.account.address}`);
}

console.log("Granting operational roles...");
await grantRole("SUPPLIER_ROLE", supplier);
await grantRole("ASSEMBLER_ROLE", assembler);
await grantRole("AUDITOR_ROLE", auditor);
// The assembler physically holds the first board, so it is also a custodian.
await grantRole("CUSTODIAN_ROLE", assembler);
await grantRole("CUSTODIAN_ROLE", custodian);

// ---------------------------------------------------------------- artifacts

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
  roles: {
    supplier: supplier.account.address,
    assembler: assembler.account.address,
    auditor: auditor.account.address,
    custodian: custodian.account.address,
  },
  abi: artifact.abi,
};

const outPath = join(outDir, `${chainId}.json`);
writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log(`\nWrote ${outPath}`);
console.log(`Chain id: ${chainId}  Contract: ${contract.address}`);
console.log(
  "\nImport the printed Hardhat private keys into MetaMask to act as each role.\n" +
    "Local node only - never reuse these keys anywhere else.",
);
