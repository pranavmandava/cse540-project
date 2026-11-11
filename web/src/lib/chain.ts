import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  createPublicClient,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
} from "viem";
import { hardhat } from "viem/chains";
import { RPC_URL, deployment } from "./deployment";

export const ABI = deployment.abi as Abi;
export const CONTRACT_ADDRESS = deployment.address as Address;
export const CHAIN_ID = deployment.chainId;

/** Reads go over plain HTTP; writes go through the injected wallet. */
export const publicClient = createPublicClient({
  chain: hardhat,
  // Same-origin proxy so the browser never calls the node across origins.
  transport: http("/api/rpc"),
});

export const ROLE_NAMES = [
  "DEFAULT_ADMIN_ROLE",
  "SUPPLIER_ROLE",
  "ASSEMBLER_ROLE",
  "AUDITOR_ROLE",
  "CUSTODIAN_ROLE",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_HASH: Record<RoleName, `0x${string}`> = Object.fromEntries(
  ROLE_NAMES.map((role) => [role, keccak256(toHex(role))]),
) as Record<RoleName, `0x${string}`>;

const ROLE_LABEL: Record<string, string> = {
  [ROLE_HASH.DEFAULT_ADMIN_ROLE]: "ADMIN",
  [ROLE_HASH.SUPPLIER_ROLE]: "SUPPLIER",
  [ROLE_HASH.ASSEMBLER_ROLE]: "ASSEMBLER",
  [ROLE_HASH.AUDITOR_ROLE]: "AUDITOR",
  [ROLE_HASH.CUSTODIAN_ROLE]: "CUSTODIAN",
};

export const CERT_TYPES = [
  { value: 0, label: "RoHS", hint: "EU 2015/863 hazardous substances" },
  { value: 1, label: "REACH", hint: "SVHC candidate list declaration" },
  { value: 2, label: "FCC", hint: "Part 15 unintentional radiator" },
] as const;

export const CUSTODY_STATE = ["None", "In custody", "In transit"] as const;

// ---------------------------------------------------------------------------
// Types mirroring the Solidity structs (bigint for uint64 / uint256).
// ---------------------------------------------------------------------------

export interface CertificateRow {
  id: bigint;
  componentId: string;
  certType: number;
  docHash: string;
  docCID: string;
  issuedBy: string;
  attestedBy: string;
  issuedAt: bigint;
  attestedAt: bigint;
  attested: boolean;
  revoked: boolean;
}

export interface ComponentRow {
  componentId: string;
  datasheetHash: string;
  datasheetCID: string;
  supplier: string;
  registeredAt: bigint;
  certificates: CertificateRow[];
}

export interface CustodyEvent {
  kind: "initiated" | "accepted" | "cancelled";
  from?: string;
  to?: string;
  at: bigint;
  txHash: string;
}

export interface BoardRow {
  boardId: string;
  assembler: string;
  custodian: string;
  pendingCustodian: string;
  state: number;
  assembledAt: bigint;
  componentIds: string[];
  components: ComponentRow[];
  compliant: boolean;
  missing: string[];
  custody: CustodyEvent[];
}

export interface Snapshot {
  components: ComponentRow[];
  boards: BoardRow[];
  eventCount: number;
  loadedAt: number;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function readContract<T>(
  functionName: string,
  args: readonly unknown[] = [],
): Promise<T> {
  return (await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName,
    args,
  })) as T;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Rebuild the whole registry from logs, then hydrate each record from storage.
 * At demo scale (3 batches, 1 board) this is a handful of RPC calls and removes
 * any need for an indexer or a hard-coded list of ids.
 */
export async function loadSnapshot(): Promise<Snapshot> {
  const events = (await publicClient.getContractEvents({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    fromBlock: 0n,
  })) as unknown as Array<{
    eventName: string;
    args: Record<string, unknown>;
    blockNumber: bigint;
    transactionHash: string;
  }>;

  const componentIds = unique(
    events
      .filter((event) => event.eventName === "ComponentRegistered")
      .map((event) => event.args.componentId as string),
  );

  const components = await Promise.all(
    componentIds.map(async (componentId) => {
      const [component, certificates] = await Promise.all([
        readContract<Omit<ComponentRow, "certificates">>("getComponent", [componentId]),
        readContract<CertificateRow[]>("getComponentCertificates", [componentId]),
      ]);
      return { ...component, certificates };
    }),
  );

  const boardIds = unique(
    events
      .filter((event) => event.eventName === "BoardAssembled")
      .map((event) => event.args.boardId as string),
  );

  const boards = await Promise.all(
    boardIds.map(async (boardId): Promise<BoardRow> => {
      const [board, ids, compliance] = await Promise.all([
        readContract<Omit<BoardRow, "componentIds" | "components" | "compliant" | "missing" | "custody">>(
          "getBoard",
          [boardId],
        ),
        readContract<string[]>("getBoardComponents", [boardId]),
        readContract<readonly [boolean, string[]]>("verifyCompliance", [boardId]),
      ]);

      const custodyLogs = events.filter(
        (event) =>
          event.eventName.startsWith("Transfer") && event.args.boardId === boardId,
      );

      const custody = await Promise.all(
        custodyLogs.map(async (event): Promise<CustodyEvent> => {
          const block = await publicClient.getBlock({ blockNumber: event.blockNumber });
          const kind =
            event.eventName === "TransferInitiated"
              ? "initiated"
              : event.eventName === "TransferAccepted"
                ? "accepted"
                : "cancelled";
          return {
            kind,
            from: event.args.from as string | undefined,
            to: event.args.to as string | undefined,
            at: block.timestamp,
            txHash: event.transactionHash,
          };
        }),
      );

      return {
        ...board,
        componentIds: ids,
        components: ids
          .map((id) => components.find((component) => component.componentId === id))
          .filter((component): component is ComponentRow => Boolean(component)),
        compliant: compliance[0],
        missing: [...compliance[1]],
        custody,
      };
    }),
  );

  return {
    components,
    boards,
    eventCount: events.length,
    loadedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function formatArg(value: unknown): string {
  if (typeof value === "string" && value.startsWith("0x") && value.length === 66) {
    return ROLE_LABEL[value] ?? `${value.slice(0, 10)}…`;
  }
  if (typeof value === "string" && value.startsWith("0x") && value.length === 42) {
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
  }
  if (typeof value === "bigint") return value.toString();
  return String(value);
}

/** Turn a viem revert into the custom error name the contract defines. */
export function describeError(error: unknown): string {
  if (error instanceof BaseError) {
    const rejected = error.walk((cause) => cause instanceof UserRejectedRequestError);
    if (rejected) return "Transaction rejected in MetaMask.";

    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name) {
        const args = (reverted.data?.args ?? []).map(formatArg).join(", ");
        return args ? `${name}(${args})` : name;
      }
      return reverted.shortMessage;
    }

    return error.shortMessage;
  }

  return error instanceof Error ? error.message : String(error);
}
