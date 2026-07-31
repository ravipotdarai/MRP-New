import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SoftSecurity } from "@/components/SoftSecurity";
import { VaultSessionProvider } from "@/lib/vault-session";

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VaultSessionProvider>
      <SoftSecurity>
        <ErrorBoundary>
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
      </SoftSecurity>
    </VaultSessionProvider>
  );
}
