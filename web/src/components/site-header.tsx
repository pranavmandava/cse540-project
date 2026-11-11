import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Boxes, Copy, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useApp } from "@/lib/app";
import { CHAIN_ID, CONTRACT_ADDRESS } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RoleBadge } from "./bits";

const NAV = [
  { to: "/", label: "Verify" },
  { to: "/register", label: "Supplier" },
  { to: "/assemble", label: "Assembly" },
  { to: "/audit", label: "Audit" },
  { to: "/custody", label: "Custody" },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background">
            <Boxes className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block font-heading text-sm font-semibold tracking-tight">
              HBOM Provenance
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              CSE 540 · Group 18
            </span>
          </span>
        </Link>

        <nav className="-mx-2 flex items-center gap-0.5 overflow-x-auto px-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              activeProps={{
                className: "bg-muted font-medium text-foreground hover:bg-muted",
              }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NetworkChip />
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

function NetworkChip() {
  const { isWrongNetwork } = useApp();

  return (
    <Badge variant="outline" className="hidden gap-1.5 font-normal sm:inline-flex">
      <span
        className={cn(
          "size-1.5 rounded-full",
          isWrongNetwork ? "bg-destructive" : "bg-emerald-500",
        )}
      />
      {isWrongNetwork ? "Wrong network" : "Local"}{" "}
      <span className="font-mono text-[10px] text-muted-foreground">{CHAIN_ID}</span>
    </Badge>
  );
}

function WalletButton() {
  const {
    address,
    connect,
    connecting,
    switchAccount,
    chainId,
    roles,
    refresh,
    walletError,
    isWrongNetwork,
  } = useApp();

  if (!address) {
    return (
      <Button size="sm" onClick={connect} disabled={connecting}>
        <Wallet className="size-4" />
        {connecting ? "Connecting…" : "Connect wallet"}
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 font-mono text-xs">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {shortAddress(address)}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connected wallet</DialogTitle>
          <DialogDescription>
            Transactions are signed in MetaMask. Reads go straight to the node.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Address
            </p>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <span className="truncate font-mono text-xs">{address}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(address);
                  toast.success("Address copied");
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              On-chain roles
            </p>
            <div className="flex flex-wrap gap-1.5">
              {roles.length ? (
                roles.map((role) => <RoleBadge key={role} role={role} />)
              ) : (
                <span className="text-xs text-muted-foreground">
                  No roles on this deployment. Reads only.
                </span>
              )}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Wallet chain</p>
              <p className={cn("mt-0.5 font-mono", isWrongNetwork && "text-destructive")}>
                {chainId ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Contract chain</p>
              <p className="mt-0.5 font-mono">{CHAIN_ID}</p>
            </div>
          </div>

          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">Contract</p>
            <p className="truncate font-mono">{CONTRACT_ADDRESS}</p>
          </div>

          {isWrongNetwork ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Your wallet is on another chain. MetaMask will prompt to switch when you send.
            </p>
          ) : null}

          {walletError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {walletError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={switchAccount} disabled={connecting}>
                <ArrowLeftRight className="size-3.5" />
                {connecting ? "Opening…" : "Switch account"}
              </Button>
              <Button size="sm" variant="outline" onClick={refresh}>
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            </div>
            <span className="text-[11px] text-muted-foreground">Local keys only</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
