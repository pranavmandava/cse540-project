import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CircleAlert, FileCheck2, FileUp, PackagePlus, Search, ShieldPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CertStatusPills,
  CopyValue,
  EmptyState,
  Hash,
  PageHeader,
  RoleNotice,
} from "@/components/bits";
import { useApp } from "@/lib/app";
import { CERT_TYPES } from "@/lib/chain";
import { hashFile } from "@/lib/hash";
import { categoryOf, formatTimestamp } from "@/lib/format";
import { useTx } from "@/lib/use-tx";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const { snapshot, address, hasRole, connect } = useApp();
  const [filter, setFilter] = useState("");

  const batches = (snapshot?.components ?? []).filter((component) =>
    component.componentId.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier desk"
        description="Register a component batch, then attach the compliance documents that go with it. Only the wallet that registered a batch can add evidence to it."
      />

      <RoleNotice
        role="SUPPLIER_ROLE"
        address={address}
        hasRole={hasRole("SUPPLIER_ROLE")}
        onConnect={connect}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <RegisterComponentCard />
        <AddCertificateCard />
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium">Registered batches</CardTitle>
              <CardDescription>
                Read back from the contract after every transaction.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter batches"
                className="h-8 pl-8 font-mono text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {batches.length ? (
            <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Datasheet</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((component) => (
                  <TableRow key={component.componentId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {categoryOf(component.componentId) ? (
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 text-[9px] text-muted-foreground"
                          >
                            {categoryOf(component.componentId)}
                          </Badge>
                        ) : null}
                        <span className="font-mono text-xs font-medium">
                          {component.componentId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Address value={component.supplier} />
                    </TableCell>
                    <TableCell>
                      <CertStatusPills certificates={component.certificates} />
                    </TableCell>
                    <TableCell>
                      <Hash value={component.datasheetHash} />
                    </TableCell>
                    <TableCell className="text-right text-[11px] whitespace-nowrap text-muted-foreground">
                      {formatTimestamp(component.registeredAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title={filter ? "No batch matches that filter" : "No batches registered"}
                description={
                  filter
                    ? "Try a category prefix such as CPU, MB, RAM, SSD, CASE, or PSU."
                    : "Run the seed script, or register the first batch with the form above."
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FileField({
  file,
  onFile,
  label,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40">
      <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground">
        {file ? <FileCheck2 className="size-4" /> : <FileUp className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">
          {file ? file.name : label}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {file
            ? `${(file.size / 1024).toFixed(1)} KB · hashed locally with keccak256`
            : "PDF or JSON, hashed in the browser before sending"}
        </span>
      </span>
      <input
        type="file"
        className="sr-only"
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function RegisterComponentCard() {
  const { address, hasRole } = useApp();
  const { run, pending, error } = useTx();

  const [batchId, setBatchId] = useState("");
  const [cid, setCid] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  async function onFile(next: File | null) {
    setFile(next);
    setHash(next ? (await hashFile(next)).hash : null);
  }

  const ready = batchId.trim().length > 0 && Boolean(hash);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <PackagePlus className="size-4 text-muted-foreground" />
          Register a component batch
        </CardTitle>
        <CardDescription>
          <span className="font-mono text-[11px]">registerComponent(id, datasheetHash, cid)</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="batch-id">Manufacturer part number + lot</Label>
          <Input
            id="batch-id"
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
            placeholder="CPU-AMD-R9-9950X-L2422"
            className="font-mono text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Unique per deployment. Reusing an id reverts with AlreadyExists.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Datasheet</Label>
          <FileField file={file} onFile={onFile} label="Drop or choose a datasheet" />
          {hash ? (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                keccak256
              </span>
              <CopyValue value={hash} display={hash} label="Datasheet hash" className="text-[11px]" />
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="datasheet-cid">IPFS CID</Label>
          <Input
            id="datasheet-cid"
            value={cid}
            onChange={(event) => setCid(event.target.value)}
            placeholder="bafy… (optional in the local demo)"
            className="font-mono text-xs"
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertTitle>Transaction reverted</AlertTitle>
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t pt-4">
        <span className="text-[11px] text-muted-foreground">
          {address
            ? hasRole("SUPPLIER_ROLE")
              ? "Signed as SUPPLIER"
              : "This wallet lacks SUPPLIER_ROLE"
            : "Connect a wallet to sign"}
        </span>
        <Button
          disabled={!ready || Boolean(pending)}
          onClick={async () => {
            const ok = await run("Component registered", "registerComponent", [
              batchId.trim(),
              hash,
              cid.trim(),
            ]);
            if (ok) {
              setBatchId("");
              setFile(null);
              setHash(null);
              setCid("");
            }
          }}
        >
          {pending ? "Confirming…" : "Register batch"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function AddCertificateCard() {
  const { snapshot, address, hasRole } = useApp();
  const { run, pending, error } = useTx();

  const [componentId, setComponentId] = useState("");
  const [certType, setCertType] = useState("0");
  const [cid, setCid] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<`0x${string}` | null>(null);

  async function onFile(next: File | null) {
    setFile(next);
    setHash(next ? (await hashFile(next)).hash : null);
  }

  const ready = Boolean(componentId) && Boolean(hash);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ShieldPlus className="size-4 text-muted-foreground" />
          Attach compliance evidence
        </CardTitle>
        <CardDescription>
          <span className="font-mono text-[11px]">
            addCertificate(componentId, type, docHash, cid)
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Component batch</Label>
            <Select value={componentId} onValueChange={setComponentId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a batch" />
              </SelectTrigger>
              <SelectContent>
                {snapshot?.components.map((component) => (
                  <SelectItem key={component.componentId} value={component.componentId}>
                    <span className="font-mono text-xs">{component.componentId}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Document type</Label>
            <Select value={certType} onValueChange={setCertType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CERT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={String(type.value)}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Signed declaration</Label>
          <FileField file={file} onFile={onFile} label="Drop or choose a certificate" />
          {hash ? (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                keccak256
              </span>
              <CopyValue value={hash} display={hash} label="Document hash" className="text-[11px]" />
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="doc-cid">IPFS CID</Label>
          <Input
            id="doc-cid"
            value={cid}
            onChange={(event) => setCid(event.target.value)}
            placeholder="bafy… (optional in the local demo)"
            className="font-mono text-xs"
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertTitle>Transaction reverted</AlertTitle>
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t pt-4">
        <span className="text-[11px] text-muted-foreground">
          {address
            ? hasRole("SUPPLIER_ROLE")
              ? "Auditor must attest separately"
              : "This wallet lacks SUPPLIER_ROLE"
            : "Connect a wallet to sign"}
        </span>
        <Button
          disabled={!ready || Boolean(pending)}
          onClick={async () => {
            const ok = await run("Certificate added", "addCertificate", [
              componentId,
              Number(certType),
              hash,
              cid.trim(),
            ]);
            if (ok) {
              setFile(null);
              setHash(null);
              setCid("");
            }
          }}
        >
          {pending ? "Confirming…" : "Add document"}
        </Button>
      </CardFooter>
    </Card>
  );
}
