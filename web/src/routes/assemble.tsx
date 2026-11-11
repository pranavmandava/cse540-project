import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CircleAlert, Layers, ListChecks } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CertStatusPills, EmptyState, PageHeader, RoleNotice } from "@/components/bits";
import { useApp } from "@/lib/app";
import { CERT_TYPES } from "@/lib/chain";
import { useTx } from "@/lib/use-tx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assemble")({
  component: AssemblePage,
});

function AssemblePage() {
  const { snapshot, address, hasRole, connect, refresh } = useApp();
  const navigate = useNavigate();
  const { run, pending, error } = useTx();

  const [boardId, setBoardId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const components = snapshot?.components ?? [];

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const summary = useMemo(() => {
    const chosen = components.filter((component) => selected.includes(component.componentId));
    const gaps = chosen.flatMap((component) =>
      CERT_TYPES.filter(
        (type) =>
          !component.certificates.some(
            (cert) => cert.certType === type.value && cert.attested && !cert.revoked,
          ),
      ).map((type) => ({ component: component.componentId, type: type.label })),
    );
    return { chosen, gaps };
  }, [components, selected]);

  const ready = boardId.trim().length > 0 && selected.length > 0;

  async function assemble() {
    const id = boardId.trim();
    const ok = await run("Board assembled", "assembleHBOM", [id, selected]);
    if (!ok) return;
    setBoardId("");
    setSelected([]);
    refresh();
    navigate({ to: "/", search: { boardId: id } });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assembly desk"
        description="Link registered component batches into a board-level HBOM. The assembler becomes the first custodian, and the board id must be unique."
      />

      <RoleNotice
        role="ASSEMBLER_ROLE"
        address={address}
        hasRole={hasRole("ASSEMBLER_ROLE")}
        onConnect={connect}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Layers className="size-4 text-muted-foreground" />
              New board HBOM
            </CardTitle>
            <CardDescription>
              <span className="font-mono text-[11px]">assembleHBOM(boardId, componentIds[])</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="board-id">Board serial</Label>
              <Input
                id="board-id"
                value={boardId}
                onChange={(event) => setBoardId(event.target.value)}
                placeholder="AXIOM-CTRL-24V-SN-000419"
                className="font-mono text-sm"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Component batches</Label>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setSelected(
                      selected.length === components.length
                        ? []
                        : components.map((component) => component.componentId),
                    )
                  }
                >
                  {selected.length === components.length ? "Clear all" : "Select all"}
                </Button>
              </div>

              {components.length ? (
                <div className="max-h-[420px] overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Batch</TableHead>
                        <TableHead>Evidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {components.map((component) => {
                        const checked = selected.includes(component.componentId);
                        return (
                          <TableRow
                            key={component.componentId}
                            data-state={checked ? "selected" : undefined}
                            className={cn("cursor-pointer", checked && "bg-muted/40")}
                            onClick={() => toggle(component.componentId)}
                          >
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggle(component.componentId)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {component.componentId}
                            </TableCell>
                            <TableCell>
                              <CertStatusPills certificates={component.certificates} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  title="No registered batches"
                  description="A supplier has to register batches before they can be assembled."
                />
              )}
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
              {selected.length} of {components.length} selected
            </span>
            <Button disabled={!ready || Boolean(pending)} onClick={assemble}>
              {pending ? "Confirming…" : "Assemble board"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="h-fit">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ListChecks className="size-4 text-muted-foreground" />
              Readiness preview
            </CardTitle>
            <CardDescription>
              Assembly does not block on evidence. Gaps stay visible until an auditor attests the
              missing document.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {summary.chosen.length ? (
              <>
                <div className="space-y-2">
                  {summary.chosen.map((component) => (
                    <div
                      key={component.componentId}
                      className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5"
                    >
                      <span className="truncate font-mono text-[11px]">
                        {component.componentId}
                      </span>
                      <CertStatusPills certificates={component.certificates} />
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Compliance forecast</p>
                  {summary.gaps.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {summary.gaps.map((gap) => (
                        <Badge
                          key={`${gap.component}-${gap.type}`}
                          variant="destructive"
                          className="font-mono text-[10px]"
                        >
                          {gap.component}:{gap.type}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-700">
                      Every selected batch has attested evidence for all three document types.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select batches to preview the board's compliance result.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
