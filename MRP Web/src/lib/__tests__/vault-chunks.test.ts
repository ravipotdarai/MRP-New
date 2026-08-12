import { describe, expect, it } from "vitest";
import {
  evtPackHourStartMs,
  partitionRecentEvtPacks,
  RECENT_WINDOW_MS,
} from "@/lib/vault-chunks";
import { dateFromIndexName, hourFromGpsFileName } from "@/features/journey/lib/gps-drive";

describe("evtPackHourStartMs", () => {
  it("parses pack hour bucket", () => {
    const ms = evtPackHourStartMs("mrp_evt_2026-08-11_14_3.enc");
    expect(ms).not.toBeNull();
    const d = new Date(ms!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(14);
  });

  it("returns null for junk names", () => {
    expect(evtPackHourStartMs("mrp_selfie_abc.enc")).toBeNull();
  });
});

describe("partitionRecentEvtPacks", () => {
  it("keeps last-hour packs in recent", () => {
    const now = new Date(2026, 7, 11, 15, 30, 0, 0).getTime();
    const packs = [
      { id: "1", name: "mrp_evt_2026-08-11_15_1.enc" },
      { id: "2", name: "mrp_evt_2026-08-11_14_1.enc" },
      { id: "3", name: "mrp_evt_2026-08-10_10_1.enc" },
      { id: "4", name: "mrp_evt_2026-08-01_01_1.enc" },
    ];
    const { recent, older } = partitionRecentEvtPacks(packs, now, RECENT_WINDOW_MS);
    const names = recent.map((f) => f.name);
    expect(names).toContain("mrp_evt_2026-08-11_15_1.enc");
    expect(names).toContain("mrp_evt_2026-08-11_14_1.enc");
    expect(older.map((f) => f.name)).toContain("mrp_evt_2026-08-01_01_1.enc");
  });
});

describe("gps file name helpers", () => {
  it("parses index date", () => {
    expect(dateFromIndexName("mrp_gps_2026-08-11_index.enc")).toBe("2026-08-11");
  });

  it("parses hour file", () => {
    expect(hourFromGpsFileName("mrp_gps_2026-08-11_09.enc", "2026-08-11")).toBe(9);
    expect(hourFromGpsFileName("mrp_gps_2026-08-11_index.enc", "2026-08-11")).toBeNull();
  });
});
