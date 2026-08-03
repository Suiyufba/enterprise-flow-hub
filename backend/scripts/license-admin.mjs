#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { sign } from "node:crypto";

function usage() {
  console.error("Usage: node backend/scripts/license-admin.mjs issue --private-key FILE --license-id ID --customer NAME --deployment ID --host HOST [--host HOST] --expires ISO_DATE");
  process.exit(2);
}

const [command, ...args] = process.argv.slice(2);
if (command !== "issue") usage();
const values = new Map();
const hosts = [];
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const value = args[i + 1];
  if (!key?.startsWith("--") || !value) usage();
  if (key === "--host") hosts.push(value);
  else values.set(key, value);
}
for (const required of ["--private-key", "--license-id", "--customer", "--deployment", "--expires"]) {
  if (!values.has(required)) usage();
}
if (hosts.length === 0) usage();
if (!Number.isFinite(Date.parse(values.get("--expires")))) usage();

const payload = {
  version: 1,
  licenseId: values.get("--license-id"),
  customer: values.get("--customer"),
  deploymentId: values.get("--deployment"),
  hosts,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(values.get("--expires")).toISOString(),
  commercial: true,
};
const payloadBytes = Buffer.from(JSON.stringify(payload));
const signature = sign(null, payloadBytes, readFileSync(values.get("--private-key")));
process.stdout.write(`efh1.${payloadBytes.toString("base64url")}.${signature.toString("base64url")}\n`);
