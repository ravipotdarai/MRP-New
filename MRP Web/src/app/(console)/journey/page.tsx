"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Alias route — Emergency monitoring is the JPNI desk. */
export default function JourneyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/emergency-monitoring");
  }, [router]);
  return (
    <p className="muted" style={{ padding: "2rem" }}>
      Opening Emergency monitoring…
    </p>
  );
}
