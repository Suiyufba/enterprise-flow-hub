import { createHash, randomUUID, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getDb } from "../db/index.js";

const PRODUCT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAiVnt66wwqefF3NibRHX493z59GiYQXP1Wne+2s96h6w=
-----END PUBLIC KEY-----`;

export interface LicensePayload {
  version: 1;
  licenseId: string;
  customer: string;
  deploymentId: string;
  hosts: string[];
  issuedAt: string;
  expiresAt: string;
  commercial: boolean;
}

export type LicenseState = "valid" | "missing" | "invalid" | "expired" | "binding_mismatch";

export interface LicenseStatus {
  state: LicenseState;
  valid: boolean;
  enforcement: "monitor" | "enforce";
  licenseId: string | null;
  customer: string | null;
  deploymentId: string;
  installationId: string;
  hosts: string[];
  expiresAt: string | null;
  fingerprint: string;
  reason?: string;
}

function normalizeHost(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/:]/)[0] ?? "";
  }
}

function installationFile(): string {
  if (process.env.LICENSE_INSTANCE_FILE?.trim()) return process.env.LICENSE_INSTANCE_FILE.trim();
  const dbPath = process.env.DB_PATH?.trim() || join(process.cwd(), "backend", "data", "efh.db");
  return join(dirname(dbPath), ".efh-instance-id");
}

export function getInstallationId(): string {
  const file = installationFile();
  if (existsSync(file)) {
    const existing = readFileSync(file, "utf8").trim();
    if (existing) return existing;
  }
  mkdirSync(dirname(file), { recursive: true });
  const created = `inst-${randomUUID()}`;
  writeFileSync(file, `${created}\n`, { encoding: "utf8", mode: 0o600 });
  return created;
}

function fingerprintFor(licenseId: string, deploymentId: string, installationId: string): string {
  return createHash("sha256")
    .update(`efh-provenance-v1\0${licenseId}\0${deploymentId}\0${installationId}`)
    .digest("hex")
    .slice(0, 20);
}

function isPayload(value: unknown): value is LicensePayload {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LicensePayload>;
  return item.version === 1
    && typeof item.licenseId === "string"
    && typeof item.customer === "string"
    && typeof item.deploymentId === "string"
    && Array.isArray(item.hosts)
    && item.hosts.every((host) => typeof host === "string")
    && typeof item.issuedAt === "string"
    && typeof item.expiresAt === "string"
    && typeof item.commercial === "boolean";
}

export function verifyLicenseToken(
  token: string,
  context: { deploymentId: string; host: string; now?: Date; installationId?: string },
  publicKey = PRODUCT_PUBLIC_KEY,
): LicenseStatus {
  const installationId = context.installationId ?? getInstallationId();
  const enforcement = process.env.LICENSE_ENFORCEMENT === "enforce" ? "enforce" : "monitor";
  const fallback = (state: LicenseState, reason: string, payload?: Partial<LicensePayload>): LicenseStatus => ({
    state,
    valid: false,
    enforcement,
    licenseId: payload?.licenseId ?? null,
    customer: payload?.customer ?? null,
    deploymentId: context.deploymentId,
    installationId,
    hosts: payload?.hosts ?? [],
    expiresAt: payload?.expiresAt ?? null,
    fingerprint: fingerprintFor(payload?.licenseId ?? "unlicensed", context.deploymentId, installationId),
    reason,
  });

  if (!token.trim()) return fallback("missing", "license token is not configured");
  const [prefix, encodedPayload, encodedSignature, ...extra] = token.trim().split(".");
  if (prefix !== "efh1" || !encodedPayload || !encodedSignature || extra.length > 0) {
    return fallback("invalid", "license token format is invalid");
  }

  let payload: LicensePayload;
  try {
    const payloadBytes = Buffer.from(encodedPayload, "base64url");
    const signature = Buffer.from(encodedSignature, "base64url");
    if (!verify(null, payloadBytes, publicKey, signature)) {
      return fallback("invalid", "license signature verification failed");
    }
    const parsed: unknown = JSON.parse(payloadBytes.toString("utf8"));
    if (!isPayload(parsed)) return fallback("invalid", "license payload is invalid");
    payload = parsed;
  } catch {
    return fallback("invalid", "license token could not be decoded");
  }

  const now = context.now ?? new Date();
  if (!Number.isFinite(Date.parse(payload.expiresAt)) || now.getTime() > Date.parse(payload.expiresAt)) {
    return fallback("expired", "license has expired", payload);
  }
  const configuredHost = normalizeHost(context.host);
  const licensedHosts = payload.hosts.map(normalizeHost);
  if (payload.deploymentId !== context.deploymentId || (configuredHost && !licensedHosts.includes(configuredHost))) {
    return fallback("binding_mismatch", "license is bound to another deployment or host", payload);
  }

  return {
    state: "valid",
    valid: true,
    enforcement,
    licenseId: payload.licenseId,
    customer: payload.customer,
    deploymentId: context.deploymentId,
    installationId,
    hosts: payload.hosts,
    expiresAt: payload.expiresAt,
    fingerprint: fingerprintFor(payload.licenseId, context.deploymentId, installationId),
  };
}

let cachedStatus: LicenseStatus | null = null;

export function getLicenseStatus(): LicenseStatus {
  if (cachedStatus) return cachedStatus;
  const host = process.env.LICENSE_HOST?.trim() || process.env.CORS_ORIGIN?.split(",")[0]?.trim() || "localhost";
  const deploymentId = process.env.LICENSE_DEPLOYMENT_ID?.trim() || "development";
  cachedStatus = verifyLicenseToken(process.env.LICENSE_TOKEN ?? "", { deploymentId, host });
  return cachedStatus;
}

export function provenanceMarker(): { product: string; fingerprint: string; licenseState: LicenseState } {
  const status = getLicenseStatus();
  return { product: "enterprise-flow-hub", fingerprint: status.fingerprint, licenseState: status.state };
}

export function recordInstallationProvenance(): LicenseStatus {
  const status = getLicenseStatus();
  getDb().prepare(`
    INSERT INTO installation_provenance (
      id, installation_id, fingerprint, license_id, license_state, first_seen_at, last_seen_at
    ) VALUES ('primary', ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      installation_id = excluded.installation_id,
      fingerprint = excluded.fingerprint,
      license_id = excluded.license_id,
      license_state = excluded.license_state,
      last_seen_at = datetime('now')
  `).run(status.installationId, status.fingerprint, status.licenseId, status.state);
  return status;
}

export function resetLicenseCacheForTests(): void {
  cachedStatus = null;
}
