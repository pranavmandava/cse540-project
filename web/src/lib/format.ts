export function shortAddress(address?: string | null): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash?: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** uint64 seconds -> "11 Nov 2026, 14:22" (local time, stable formatting). */
export function formatTimestamp(seconds?: bigint | number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const value = typeof seconds === "bigint" ? Number(seconds) : seconds;
  if (!value) return "—";
  return new Date(value * 1000).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function certLabel(type: number): string {
  return ["RoHS", "REACH", "FCC"][type] ?? `Type ${type}`;
}

export function certStatus(cert: {
  attested: boolean;
  revoked: boolean;
}): "attested" | "pending" | "revoked" {
  if (cert.revoked) return "revoked";
  if (cert.attested) return "attested";
  return "pending";
}

const CATEGORIES = new Set(["CPU", "MB", "RAM", "SSD", "CASE", "PSU", "GPU", "COOLER"]);

/** Batch ids are prefixed with their category, e.g. CPU-AMD-R7-9800X3D-L2418. */
export function categoryOf(componentId: string): string | null {
  const prefix = componentId.split("-")[0]?.toUpperCase() ?? "";
  return CATEGORIES.has(prefix) ? prefix : null;
}
