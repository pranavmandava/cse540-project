/**
 * Writes MetaMask-importable keystore files for the five demo participants.
 *
 * MetaMask has no bulk import: each file creates one account, so this writes one
 * JSON per role. Use MetaMask's "Add wallet -> Private key -> Select type: JSON
 * File", pick the file, leave the password blank, Import.
 *
 *   bun run keystores              # blank password
 *   bun run keystores --password demo
 *
 * The accounts are derived from Hardhat's public dev mnemonic at the standard
 * m/44'/60'/0'/0/i path, so they always match the addresses the node funds.
 * These files are gitignored: they are test keys, but they are still keys.
 */
import { HDNodeWallet } from "ethers";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MNEMONIC = "test test test test test test test test test test test junk";
const HDPATH = "m/44'/60'/0'/0";

const PASSWORD =
  process.argv[process.argv.indexOf("--password") + 1] &&
  process.argv.includes("--password")
    ? process.argv[process.argv.indexOf("--password") + 1]
    : "";

const CAST = [
  { index: 0, name: "admin", role: "DEFAULT_ADMIN_ROLE", purpose: "grants roles" },
  { index: 1, name: "supplier", role: "SUPPLIER_ROLE", purpose: "registers batches, uploads documents" },
  { index: 2, name: "assembler", role: "ASSEMBLER_ROLE", purpose: "assembles boards, starts custody" },
  { index: 3, name: "auditor", role: "AUDITOR_ROLE", purpose: "attests and revokes documents" },
  { index: 4, name: "distributor", role: "CUSTODIAN_ROLE", purpose: "receives custody" },
] as const;

const deployment = JSON.parse(
  readFileSync(join("shared", "deployments", "31337.json"), "utf8"),
) as { address: string; chainId: number; roles: Record<string, string> };

const outDir = join("shared", "keystores");
mkdirSync(outDir, { recursive: true });

const accounts = [];

for (const entry of CAST) {
  const wallet = HDNodeWallet.fromPhrase(MNEMONIC, undefined, `${HDPATH}/${entry.index}`);

  const expected = deployment.roles[entry.name];
  if (expected && expected.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `Derived ${entry.name} address ${wallet.address} does not match the deployment (${expected}).`,
    );
  }

  const keystore = JSON.parse(await wallet.encrypt(PASSWORD));
  // The Web3 Secret Storage spec (and geth) use lowercase "crypto"; ethers
  // writes "Crypto". Normalise so every importer accepts the file.
  if (keystore.Crypto) {
    keystore.crypto = keystore.Crypto;
    delete keystore.Crypto;
  }
  const file = join(outDir, `${entry.index}-${entry.name}.json`);
  writeFileSync(file, `${JSON.stringify(keystore, null, 2)}\n`);

  accounts.push({
    name: entry.name,
    role: entry.role,
    purpose: entry.purpose,
    address: wallet.address,
    derivationPath: `${HDPATH}/${entry.index}`,
    keystore: file,
  });

  console.log(`  wrote ${file}  ${wallet.address}`);
}

const manifest = {
  note: "Local demo only. These keys belong to Hardhat's public dev mnemonic.",
  chainId: deployment.chainId,
  rpcUrl: "http://127.0.0.1:8545",
  contractAddress: deployment.address,
  mnemonic: MNEMONIC,
  importPassword: PASSWORD,
  accounts,
};

writeFileSync(join("shared", "demo-accounts.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`
Keystore files written to ${outDir}/
${PASSWORD ? `Password for every file: ${PASSWORD}` : "Password: leave the field blank"}

MetaMask: Account menu -> Add wallet -> Private key -> Select type: JSON File
          -> Choose File -> Import. Repeat once per file.

Or, if you prefer no files at all: Settings -> Add wallet -> Import a wallet,
paste the Hardhat seed phrase below, then use "Add account" for #1-#4.

  ${MNEMONIC}

Reference: shared/demo-accounts.json
`);
