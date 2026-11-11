import appCss from "@/styles/globals.css?url";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/site-header";
import { AppProvider } from "@/lib/app";
import { CONTRACT_ADDRESS } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // The UI ships a single light theme. Dark Reader (and similar forced-dark
      // extensions) otherwise invert it into an unreadable grey-on-grey page.
      { name: "darkreader-lock", content: "true" },
      { title: "HBOM Provenance — CSE 540 Group 18" },
      {
        name: "description",
        content:
          "Blockchain-backed electronics bill of materials: component batches, compliance evidence, and custody history.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProvider>
          <div className="flex min-h-dvh flex-col bg-muted/30">
            <SiteHeader />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
            <footer className="border-t bg-background">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-muted-foreground">
                <span>
                  Electronics HBOM provenance · CSE 540 Group 18 · Pranav Mandava, Suhas Gajula,
                  Thushar Reddy Vemula, Varshini Akula, Venkata Pradeep Reddy Venuthurla
                </span>
                <span className="font-mono">{shortAddress(CONTRACT_ADDRESS)}</span>
              </div>
            </footer>
          </div>
          <Toaster position="bottom-right" richColors />
        </AppProvider>
        <Scripts />
      </body>
    </html>
  );
}
