import { Fragment, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Address,
  CertStatusBadge,
  CertStatusPills,
  ComplianceBadge,
  CopyValue,
  EmptyState,
  Hash,
  PageHeader,
  Stat,
} from "@/components/bits";
import { useApp } from "@/lib/app";
import { CERT_TYPES, CUSTODY_STATE, type BoardRow, type CertificateRow } from "@/lib/chain";
import { categoryOf, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { boardId?: string } => ({
    boardId: typeof search.boardId === "string" ? search.boardId : undefined,
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { snapshot, loading, loadError, refresh } = useApp();
  const { boardId } = Route.useSearch();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const boards = snapshot?.boards ?? [];
  const board = boardId ? boards.find((item) => item.boardId === boardId) : boards[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verify a board"
        description="Every value on this page is read from the contract. The compliance badge is the contract's own answer, not a cached dashboard field."
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        }
      />

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!query.trim()) return;
          navigate({ to: "/", search: { boardId: query.trim() } });
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={boards[0]?.boardId ?? "Board serial, e.g. AXIOM-CTRL-24V-SN-000418"}
            className="h-10 bg-background pl-9 font-mono text-sm"
          />
        </div>
        <Button type="submit" className="h-10">
          Verify board
        </Button>
      </form>

      {loadError ? (
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>The local chain is not answering</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="font-mono text-xs">{loadError}</p>
            <p>
              Start <code className="rounded bg-muted px-1">bunx hardhat node</code> and run{" "}
              <code className="rounded bg-muted px-1">
                bunx hardhat run scripts/seed.ts --network localhost
              </code>
              .
            </p>
            <Button size="sm" variant="outline" onClick={refresh}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !snapshot ? <BoardSkeleton /> : null}

      {!loading && snapshot && boards.length === 0 ? (
        <EmptyState
          title="No boards on this deployment yet"
          description="Seed the demo dataset, or assemble a board from the Assembly screen."
        />
      ) : null}

      {board ? <BoardView board={board} /> : null}

      {!loading && snapshot && boardId && !board ? (
        <EmptyState
          title={`No board named ${boardId}`}
          description="Board ids are unique per deployment. Check the serial or reseed the demo data."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/">Show the seeded board</Link>
            </Button>
          }
        />
      ) : null}

      {snapshot && snapshot.boards.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {snapshot.boards.map((item) => (
            <Button key={item.boardId} asChild size="xs" variant="outline">
              <Link to="/" search={{ boardId: item.boardId }}>
                {item.boardId}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BoardView({ board }: { board: BoardRow }) {
  const [open, setOpen] = useState<string | null>(null);
  const attested = board.components.flatMap((component) =>
    component.certificates.filter((cert) => cert.attested && !cert.revoked),
  ).length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-6 pt-0 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl",
                board.compliant
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-destructive/5 text-destructive",
              )}
            >
              {board.compliant ? (
                <ShieldCheck className="size-6" />
              ) : (
                <CircleAlert className="size-6" />
              )}
            </span>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  {board.boardId}
                </h2>
                <ComplianceBadge compliant={board.compliant} />
                <Badge variant="outline" className="font-normal">
                  {CUSTODY_STATE[board.state]}
                </Badge>
              </div>
              <p className="max-w-xl text-sm text-muted-foreground">
                {board.compliant
                  ? `All ${board.components.length} components carry attested, non-revoked RoHS, REACH, and FCC evidence.`
                  : `Compliance evidence is incomplete. ${board.missing.length} gap${board.missing.length === 1 ? "" : "s"} in the HBOM.`}
              </p>
              {!board.compliant ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {board.missing.map((gap) => (
                    <Badge key={gap} variant="destructive" className="font-mono text-[10px]">
                      {gap}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-3 md:w-[340px]">
            <Stat label="Components" value={board.components.length} />
            <Stat label="Certificates" value={attested} hint="attested" />
            <Stat
              label="Gaps"
              value={board.missing.length}
              hint={board.missing.length ? "open" : "none"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Boxes className="size-4 text-muted-foreground" />
              Bill of materials
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Batch</TableHead>
                  <TableHead className="w-[168px]">Evidence</TableHead>
                  <TableHead>Datasheet</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {board.components.map((component) => {
                  const expanded = open === component.componentId;
                  return (
                    <Fragment key={component.componentId}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setOpen(expanded ? null : component.componentId)}
                      >
                        <TableCell className="pr-0">
                          <ChevronRight
                            className={cn(
                              "size-3.5 text-muted-foreground transition-transform",
                              expanded && "rotate-90",
                            )}
                          />
                        </TableCell>
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
                            <p className="font-mono text-xs font-medium">
                              {component.componentId}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            supplier <Address value={component.supplier} />
                          </p>
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
                      {expanded ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={4} className="py-3">
                            <CertificateList certificates={component.certificates} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm font-medium">Board record</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <Row label="Assembler">
                <Address value={board.assembler} />
              </Row>
              <Row label="Assembled">
                <span>{formatTimestamp(board.assembledAt)}</span>
              </Row>
              <Row label="Custodian">
                <Address value={board.custodian} />
              </Row>
              {board.pendingCustodian !==
              "0x0000000000000000000000000000000000000000" ? (
                <Row label="Pending">
                  <Address value={board.pendingCustodian} />
                </Row>
              ) : null}
              <Separator />
              <Row label="State">
                <span>{CUSTODY_STATE[board.state]}</span>
              </Row>
              <Row label="HBOM entries">
                <span className="font-mono">{board.componentIds.length}</span>
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Truck className="size-4 text-muted-foreground" />
                Custody trail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CustodyTrail board={board} />
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link to="/custody">Open custody desk</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function CertificateList({ certificates }: { certificates: CertificateRow[] }) {
  if (!certificates.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No documents attached. A supplier must upload RoHS, REACH, and FCC evidence.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {certificates.map((cert) => (
        <div
          key={cert.id.toString()}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-md border bg-background px-3 py-2"
        >
          <Badge variant="outline" className="font-mono text-[10px]">
            #{cert.id.toString()}
          </Badge>
          <div className="min-w-0">
            <p className="text-xs font-medium">
              {CERT_TYPES[cert.certType]?.label ?? cert.certType}{" "}
              <span className="font-normal text-muted-foreground">
                · issued {formatTimestamp(cert.issuedAt)}
              </span>
            </p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              doc <Hash value={cert.docHash} />
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CertStatusBadge attested={cert.attested} revoked={cert.revoked} />
          </div>
          {cert.attested ? (
            <p className="col-start-2 col-end-3 text-[11px] text-muted-foreground">
              attested by <Address value={cert.attestedBy} /> on{" "}
              {formatTimestamp(cert.attestedAt)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CustodyTrail({ board }: { board: BoardRow }) {
  if (!board.custody.length) {
    return (
      <p className="text-xs text-muted-foreground">
        Assembled in place. No handover recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {board.custody.map((event, index) => (
        <li key={`${event.txHash}-${index}`} className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
              event.kind === "accepted" && "bg-emerald-50 text-emerald-600",
              event.kind === "initiated" && "bg-muted text-muted-foreground",
              event.kind === "cancelled" && "bg-destructive/5 text-destructive",
            )}
          >
            {event.kind === "accepted" ? (
              <CheckCircle2 className="size-3.5" />
            ) : event.kind === "cancelled" ? (
              <XCircle className="size-3.5" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
          </span>
          <div className="min-w-0 text-xs">
            <p className="font-medium">
              {event.kind === "initiated"
                ? "Transfer offered"
                : event.kind === "accepted"
                  ? "Custody accepted"
                  : "Transfer cancelled"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {event.from ? <Address value={event.from} /> : null}
              {event.to ? (
                <>
                  {" → "}
                  <Address value={event.to} />
                </>
              ) : null}
              {" · "}
              {formatTimestamp(event.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
