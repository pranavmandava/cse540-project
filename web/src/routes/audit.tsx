import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleAlert, ClipboardCheck, ShieldQuestion } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Address,
  CertStatusBadge,
  CopyValue,
  EmptyState,
  PageHeader,
  RoleNotice,
  Stat,
} from "@/components/bits";
import { useApp } from "@/lib/app";
import { CERT_TYPES, type CertificateRow } from "@/lib/chain";
import { formatTimestamp } from "@/lib/format";
import { useTx } from "@/lib/use-tx";

export const Route = createFileRoute("/audit")({
  component: AuditPage,
});

type Tab = "pending" | "attested" | "revoked" | "all";

function AuditPage() {
  const { snapshot, address, hasRole, connect } = useApp();
  const isAuditor = hasRole("AUDITOR_ROLE");
  const { run, pending, error } = useTx();
  const [tab, setTab] = useState<Tab>("pending");
  const [target, setTarget] = useState<CertificateRow | null>(null);
  const [reason, setReason] = useState("");

  const certificates = useMemo(
    () =>
      (snapshot?.components ?? [])
        .flatMap((component) => component.certificates)
        .sort((a, b) => Number(b.id - a.id)),
    [snapshot],
  );

  const counts = useMemo(
    () => ({
      pending: certificates.filter((cert) => !cert.attested && !cert.revoked).length,
      attested: certificates.filter((cert) => cert.attested && !cert.revoked).length,
      revoked: certificates.filter((cert) => cert.revoked).length,
    }),
    [certificates],
  );

  const visible = certificates.filter((cert) => {
    if (tab === "all") return true;
    if (tab === "pending") return !cert.attested && !cert.revoked;
    if (tab === "attested") return cert.attested && !cert.revoked;
    return cert.revoked;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit queue"
        description="Pick a document, check the hash against the file you were sent, then attest or revoke. Attestation is a separate role: a supplier cannot approve their own evidence."
      />

      <RoleNotice
        role="AUDITOR_ROLE"
        address={address}
        hasRole={hasRole("AUDITOR_ROLE")}
        onConnect={connect}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Awaiting review" value={counts.pending} hint="no attestation yet" />
        <Stat label="Attested" value={counts.attested} hint="counts toward compliance" />
        <Stat label="Revoked" value={counts.revoked} hint="kept for the audit trail" />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <ClipboardCheck className="size-4 text-muted-foreground" />
                Documents
              </CardTitle>
              <CardDescription>
                Every certificate ever uploaded, newest first. Nothing is ever deleted.
              </CardDescription>
            </div>
            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
              <TabsList>
                <TabsTrigger value="pending">
                  Pending
                  {counts.pending ? (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                      {counts.pending}
                    </Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="attested">Attested</TabsTrigger>
                <TabsTrigger value="revoked">Revoked</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-0">
          {error ? (
            <div className="px-4 pt-4">
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertTitle>Transaction reverted</AlertTitle>
                <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {visible.length ? (
            <div className="max-h-[540px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-14">Cert</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Document hash</TableHead>
                  <TableHead>Issued by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((cert) => {
                  const self = address
                    ? cert.issuedBy.toLowerCase() === address.toLowerCase()
                    : false;

                  return (
                    <TableRow key={cert.id.toString()}>
                      <TableCell className="font-mono text-xs">
                        #{cert.id.toString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{cert.componentId}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {CERT_TYPES[cert.certType]?.label ?? cert.certType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <CopyValue
                          value={cert.docHash}
                          display={cert.docHash}
                          label="Document hash"
                          className="max-w-[190px] text-[11px]"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Address value={cert.issuedBy} />
                          {self && isAuditor ? (
                            <Badge variant="secondary" className="text-[9px]">
                              own upload
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatTimestamp(cert.issuedAt)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <CertStatusBadge attested={cert.attested} revoked={cert.revoked} />
                      </TableCell>
                      <TableCell className="text-right">
                        {!cert.attested && !cert.revoked ? (
                          <Button
                            size="xs"
                            disabled={Boolean(pending)}
                            onClick={() =>
                              run("Certificate attested", "attestCertificate", [cert.id])
                            }
                          >
                            Attest
                          </Button>
                        ) : cert.attested && !cert.revoked ? (
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => {
                              setTarget(cert);
                              setReason("");
                            }}
                          >
                            Revoke
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title={
                  tab === "pending"
                    ? "Nothing waiting for review"
                    : `No ${tab} certificates`
                }
                description={
                  tab === "pending"
                    ? "A supplier upload creates a pending document here."
                    : undefined
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <ShieldQuestion className="size-4" />
        <AlertTitle>What attestation does and does not prove</AlertTitle>
        <AlertDescription>
          It proves that the file an auditor reviewed hashes to the value on chain. It does not
          prove the component is genuine or that a lab actually ran the test.
        </AlertDescription>
      </Alert>

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke certificate #{target?.id.toString()}</DialogTitle>
            <DialogDescription>
              The record stays on chain and stays readable, but it stops counting toward
              compliance. The reason is emitted in the event log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="revoke-reason">Reason</Label>
            <Input
              id="revoke-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Failed re-inspection: SVHC declaration expired"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || Boolean(pending)}
              onClick={async () => {
                if (!target) return;
                const ok = await run("Certificate revoked", "revokeCertificate", [
                  target.id,
                  reason.trim(),
                ]);
                if (ok) setTarget(null);
              }}
            >
              Revoke attestation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
