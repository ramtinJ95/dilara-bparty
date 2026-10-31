import type { BrowserContext, Page } from "@playwright/test";
import type { Line, ProfileName } from "../phone-network.ts";

export type BrowserName = "chromium" | "webkit";
export type DeviceName = "iPhone 15" | "Pixel 7";

export type Guest = {
  name: string;
  profile: ProfileName;
  device: DeviceName;
  context: BrowserContext;
  page: Page;
  line: Line;
  filmed: boolean;
};

export type CheckResult = { step: string; label: string; ok: boolean; ms: number; error?: string; screenshot?: string };
export type Timing = { step: string; kind: string; guest: string; profile: ProfileName; ms: number; ok: boolean };

export type Rehearsal = {
  baseUrl: string;
  browser: BrowserName;
  secrets: { join: string; admin: string };
  admin: Page;
  guests: Guest[];
  // Online guests the admin counted before the cast joined, such as a real phone left open on staging.
  baselineOnline: number;
  // A guest on a good network that the steps bring online and offline, so every phone has a fresh change to show.
  probe: { name: string; page: Page; joined: boolean };
  // Records a pass or a failure and never throws, so one slow phone does not hide what the others did.
  check(label: string, run: () => Promise<unknown>, evidence?: Page): Promise<boolean>;
  // A check on one guest whose duration goes into the report's timings, grouped by kind and network profile.
  time(kind: string, guest: Guest, run: () => Promise<unknown>): Promise<boolean>;
  note(text: string): void;
};

// A step drives the cast through one part of the party and checks what the phones and the admin show.
// It must leave every guest online and current, so later steps can start from the same state.
export type Step = { id: string; title: string; run(r: Rehearsal): Promise<void> };
