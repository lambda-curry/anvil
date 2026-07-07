#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const TZ = "America/Chicago";
const fixedNowRaw = process.env.CYCLE_MEMORY_NOW;
const now = fixedNowRaw ? new Date(fixedNowRaw) : new Date();

if (Number.isNaN(now.valueOf())) {
  console.error(
    `Invalid CYCLE_MEMORY_NOW value: ${fixedNowRaw}. Expected an ISO-8601 timestamp, e.g. 2026-03-21T14:05:00Z`,
  );
  process.exit(1);
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: false,
});

const [year, month, day] = dateFormatter.format(now).split("-");
const dateStamp = `${year}-${month}-${day}`;
const timeStamp = timeFormatter.format(now);

const memoryDir = path.resolve(process.cwd(), "memory");
const memoryPath = path.join(memoryDir, `${dateStamp}.md`);

if (!existsSync(memoryDir)) {
  mkdirSync(memoryDir, { recursive: true });
}

if (!existsSync(memoryPath)) {
  writeFileSync(
    memoryPath,
    `# ${dateStamp}\n\n## Sessions\n\n### ${dateStamp} ${timeStamp} CT — <cycle type> (<outcome>)\n- Context:\n- Actions:\n- Follow-up:\n`,
  );
  console.log(`Created ${memoryPath}`);
} else {
  console.log(`Exists ${memoryPath}`);
}
