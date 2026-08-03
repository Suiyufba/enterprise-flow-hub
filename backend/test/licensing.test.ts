import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { verifyLicenseToken, type LicensePayload } from "../src/licensing/index.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function token(overrides: Partial<LicensePayload> = {}): string {
  const payload: LicensePayload = {
    version: 1,
    licenseId: "lic-test",
    customer: "Test Customer",
    deploymentId: "production-cn-1",
    hosts: ["101.200.45.180"],
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    commercial: true,
    ...overrides,
  };
  const bytes = Buffer.from(JSON.stringify(payload));
  return `efh1.${bytes.toString("base64url")}.${sign(null, bytes, privateKey).toString("base64url")}`;
}

const context = {
  deploymentId: "production-cn-1",
  host: "http://101.200.45.180",
  now: new Date("2026-08-04T00:00:00.000Z"),
  installationId: "inst-test",
};

test("accepts a correctly signed and bound license", () => {
  const result = verifyLicenseToken(token(), context, publicPem);
  assert.equal(result.valid, true);
  assert.equal(result.state, "valid");
  assert.equal(result.licenseId, "lic-test");
  assert.match(result.fingerprint, /^[a-f0-9]{20}$/);
});

test("rejects tampered payloads", () => {
  const issued = token();
  const parts = issued.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  payload.customer = "Tampered";
  parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const result = verifyLicenseToken(parts.join("."), context, publicPem);
  assert.equal(result.state, "invalid");
});

test("rejects licenses copied to another deployment", () => {
  const result = verifyLicenseToken(token(), { ...context, deploymentId: "copied-server" }, publicPem);
  assert.equal(result.state, "binding_mismatch");
});

test("rejects expired licenses", () => {
  const result = verifyLicenseToken(token({ expiresAt: "2026-01-02T00:00:00.000Z" }), context, publicPem);
  assert.equal(result.state, "expired");
});
