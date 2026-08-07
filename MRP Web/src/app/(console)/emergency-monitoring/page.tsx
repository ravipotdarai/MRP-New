"use client";

import { VaultUnlockGate } from "@/components/VaultUnlockGate";
import { EmergencyMonitoringDesk } from "@/features/journey/components/EmergencyMonitoringDesk";

export default function EmergencyMonitoringPage() {
  return (
    <VaultUnlockGate>
      <EmergencyMonitoringDesk />
    </VaultUnlockGate>
  );
}
