import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CircleAlert,
  PackageCheck,
  Truck,
  Undo2,
} from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import {
  Address,
  ComplianceBadge,
  EmptyState,
  PageHeader,
  RoleNotice,
  Stat,
} from "@/components/bits";
import { useApp } from "@/lib/app";
import { CUSTODY_STATE, type BoardRow } from "@/lib/chain";
import { deployment } from "@/lib/deployment";
import { formatTimestamp } from "@/lib/format";
import { useTx } from "@/lib/use-tx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/custody")({
  component: CustodyPage,
});

function CustodyPage() {
  const { snapshot, address, hasRole, connect } = useApp();
  const boards = snapshot?.boards ?? [];
  const [boardId, setBoardId] = useState<string | null>(null);

  const board = boards.find((item) => item.boardId === boardId) ?? boards[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Custody desk"
        description="A board moves with an offer and an acceptance. The sender cannot push it onto an unwilling recipient, and a cancelled offer leaves the board where it was."
      />

      <RoleNotice
        role="CUSTODIAN_ROLE"
        address={address}
        hasRole={hasRole("CUSTODIAN_ROLE")}
        onConnect={connect}
      />

      {boards.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {boards.map((item) => (
            <Button
              key={item.boardId}
              size="xs"
              variant={item.boardId === board?.boardId ? "default" : "outline"}
              onClick={() => setBoardId(item.boardId)}
              className="font-mono"
            >
              {item.boardId}
            </Button>
          ))}
        </div>
      ) : null}

      {!board ? (
        <EmptyState
          title="No boards to hold"
          description="Assemble a board first; the assembler becomes its first custodian."
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/assemble">Go to assembly</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <BoardState board={board} />
          <TransferPanel board={board} />
        </div>
      )}
    </div>
  );
}

function BoardState({ board }: { board: BoardRow }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Truck className="size-4 text-muted-foreground" />
            <span className="font-mono">{board.boardId}</span>
            <ComplianceBadge compliant={board.compliant} />
            <Badge variant="outline" className="font-normal">
              {CUSTODY_STATE[board.state]}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-0">
          <Stat label="Current holder" value={<Address value={board.custodian} />} />
          <Stat
            label="Pending recipient"
            value={
              board.pendingCustodian === "0x0000000000000000000000000000000000000000" ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Address value={board.pendingCustodian} />
              )
            }
          />
          <Stat label="Components" value={board.components.length} />
          <Stat label="Assembled" value={<span className="text-sm">{formatTimestamp(board.assembledAt)}</span>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm font-medium">Transfer history</CardTitle>
          <CardDescription>Reconstructed from Transfer* events.</CardDescription>
        </CardHeader>
        <CardContent>
          {board.custody.length ? (
            <ol className="space-y-3">
              {board.custody.map((event, index) => (
                <li key={`${event.txHash}-${index}`} className="flex items-start gap-2.5 text-xs">
                  <span
                    className={cn(
                      "mt-0.5 size-2 shrink-0 rounded-full",
                      event.kind === "accepted" && "bg-emerald-500",
                      event.kind === "initiated" && "bg-amber-500",
                      event.kind === "cancelled" && "bg-destructive",
                    )}
                  />
                  <div>
                    <p className="font-medium capitalize">
                      {event.kind === "initiated"
                        ? "Offer sent"
                        : event.kind === "accepted"
                          ? "Offer accepted"
                          : "Offer cancelled"}
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
          ) : (
            <p className="text-xs text-muted-foreground">
              No handover yet. The assembler still holds the board.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TransferPanel({ board }: { board: BoardRow }) {
  const { address } = useApp();
  const { run, pending, error } = useTx();
  const [recipient, setRecipient] = useState<string>(deployment.roles.custodian);

  useEffect(() => {
    setRecipient(deployment.roles.custodian);
  }, [board.boardId]);

  const isCustodian = address
    ? board.custodian.toLowerCase() === address.toLowerCase()
    : false;
  const isRecipient = address
    ? board.pendingCustodian.toLowerCase() === address.toLowerCase()
    : false;

  return (
    <Card className="h-fit">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ArrowRightLeft className="size-4 text-muted-foreground" />
          Handover
        </CardTitle>
        <CardDescription>
          {board.state === 1
            ? "The holder offers the board; the recipient accepts in a second transaction."
            : "An offer is open. The nominated recipient can accept, or the sender can withdraw it."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {board.state === 1 ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="recipient">Recipient address</Label>
              <Input
                id="recipient"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                The recipient must already hold CUSTODIAN_ROLE. An unknown address reverts with
                InvalidAddress, a self-transfer with SelfTransfer.
              </p>
            </div>

            {!isCustodian && address ? (
              <Alert>
                <CircleAlert className="size-4" />
                <AlertDescription className="text-xs">
                  Connected wallet is not the current holder. Submitting will revert with
                  NotCustodian.
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              className="w-full"
              disabled={!address || !recipient.trim() || Boolean(pending)}
              onClick={() =>
                run("Transfer initiated", "initiateTransfer", [
                  board.boardId,
                  recipient.trim(),
                ])
              }
            >
              Offer custody
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs">
              <p className="text-muted-foreground">Waiting for</p>
              <p className="mt-1">
                <Address value={board.pendingCustodian} />
              </p>
              {!isRecipient && address ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Accepting from another account reverts with NotCustodian.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Button
                disabled={Boolean(pending)}
                onClick={() => run("Custody accepted", "acceptTransfer", [board.boardId])}
              >
                <PackageCheck className="size-4" />
                Accept custody
              </Button>
              <Button
                variant="outline"
                disabled={Boolean(pending)}
                onClick={() => run("Transfer cancelled", "cancelTransfer", [board.boardId])}
              >
                <Undo2 className="size-4" />
                Cancel offer
              </Button>
            </div>
          </>
        )}

        {error ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertTitle>Transaction reverted</AlertTitle>
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
          </Alert>
        ) : null}

        <Separator />

        <div className="space-y-1 text-[11px] text-muted-foreground">
          <p>
            Connected as <span className="font-mono">{address ? <Address value={address} /> : "—"}</span>
          </p>
          <p>
            Holder is{" "}
            <span className="font-mono">
              <Address value={board.custodian} />
            </span>
          </p>
        </div>
      </CardContent>
      <CardFooter className="border-t pt-4 text-[11px] text-muted-foreground">
        Two-step handover prevents a sender from forcing a board onto an address that cannot
        account for it.
      </CardFooter>
    </Card>
  );
}
