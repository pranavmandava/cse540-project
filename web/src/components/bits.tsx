import { useState, type ReactNode } from "react";
import { Check, Copy, Info } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CERT_TYPES, type CertificateRow, type RoleName } from "@/lib/chain";
import { certStatus, shortAddress, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CopyValue({
  value,
  display,
  className,
  label,
}: {
  value: string;
  display?: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label ?? "Value"} copied`);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-md font-mono text-xs text-foreground/80 transition-colors hover:text-foreground",
        className,
      )}
    >
      <span className="truncate">{display ?? value}</span>
      {copied ? (
        <Check className="size-3 text-emerald-600" />
      ) : (
        <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}

export function Hash({ value }: { value: string }) {
  return <CopyValue value={value} display={shortHash(value)} label="Hash" />;
}

export function Address({ value }: { value: string }) {
  return <CopyValue value={value} display={shortAddress(value)} label="Address" />;
}

export function RoleBadge({ role }: { role: RoleName }) {
  const label = role.replace("_ROLE", "").replace("DEFAULT_ADMIN", "ADMIN");
  return (
    <Badge variant="outline" className="font-mono text-[10px] tracking-wide">
      {label}
    </Badge>
  );
}

export function ComplianceBadge({ compliant }: { compliant: boolean }) {
  return compliant ? (
    <Badge className="border-emerald-600/25 bg-emerald-50 text-emerald-700" variant="outline">
      Compliant
    </Badge>
  ) : (
    <Badge variant="destructive">Not compliant</Badge>
  );
}

/**
 * One pill per required document family. "Attested" wins over pending, pending
 * wins over revoked, and no record at all renders as a dashed "missing" chip.
 */
export function CertStatusPills({ certificates }: { certificates: CertificateRow[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 whitespace-nowrap">
      {CERT_TYPES.map((type) => {
        const matches = certificates.filter((cert) => cert.certType === type.value);
        const attested = matches.some((cert) => cert.attested && !cert.revoked);
        const pending = !attested && matches.some((cert) => !cert.attested && !cert.revoked);
        const revoked = !attested && !pending && matches.some((cert) => cert.revoked);
        const status = attested ? "attested" : pending ? "pending" : revoked ? "revoked" : "missing";

        return (
          <Badge
            key={type.value}
            variant="outline"
            title={type.hint}
            className={cn(
              "gap-1 px-1.5 text-[10px]",
              status === "attested" &&
                "border-emerald-600/25 bg-emerald-50 text-emerald-700",
              status === "pending" && "border-amber-500/30 bg-amber-50 text-amber-700",
              status === "revoked" && "border-destructive/30 bg-destructive/5 text-destructive",
              status === "missing" && "border-dashed text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                status === "attested" && "bg-emerald-600",
                status === "pending" && "bg-amber-500",
                status === "revoked" && "bg-destructive",
                status === "missing" && "bg-muted-foreground/40",
              )}
            />
            {type.label}
          </Badge>
        );
      })}
    </div>
  );
}

export function CertStatusBadge({
  attested,
  revoked,
}: {
  attested: boolean;
  revoked: boolean;
}) {
  const status = certStatus({ attested, revoked });
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        status === "attested" && "border-emerald-600/25 bg-emerald-50 text-emerald-700",
        status === "pending" && "border-amber-500/30 bg-amber-50 text-amber-700",
        status === "revoked" && "border-destructive/30 bg-destructive/5 text-destructive",
      )}
    >
      {status}
    </Badge>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/**
 * Shown on every role-gated screen. It warns, but never disables the action:
 * sending from the wrong account is how the demo shows the contract reverting
 * with AccessControlUnauthorizedAccount.
 */
export function RoleNotice({
  role,
  address,
  hasRole,
  onConnect,
}: {
  role: RoleName;
  address: string | null;
  hasRole: boolean;
  onConnect: () => void;
}) {
  if (!address) {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Connect a wallet to act</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>
            This screen sends transactions as <span className="font-mono">{role}</span>.
          </span>
          <Button size="sm" variant="outline" onClick={onConnect}>
            Connect MetaMask
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (hasRole) return null;

  return (
    <Alert>
      <Info className="size-4" />
      <AlertTitle>This account does not hold {role.replace("_ROLE", "")}</AlertTitle>
      <AlertDescription>
        Browsing still works. Submitting will revert with{" "}
        <span className="font-mono text-xs">AccessControlUnauthorizedAccount</span>, which is the
        access-control check doing its job.
      </AlertDescription>
    </Alert>
  );
}
