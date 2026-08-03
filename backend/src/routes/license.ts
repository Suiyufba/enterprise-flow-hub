import type { FastifyInstance } from "fastify";
import { getLicenseStatus } from "../licensing/index.js";
import { requireAdminActor } from "./auth-context.js";

export async function licenseRoutes(app: FastifyInstance): Promise<void> {
  app.get("/license/status", async (request, reply) => {
    if (!requireAdminActor(request, reply)) return;
    const status = getLicenseStatus();
    return {
      state: status.state,
      valid: status.valid,
      enforcement: status.enforcement,
      licenseId: status.licenseId,
      customer: status.customer,
      deploymentId: status.deploymentId,
      installationId: status.installationId,
      hosts: status.hosts,
      expiresAt: status.expiresAt,
      fingerprint: status.fingerprint,
      reason: status.reason,
    };
  });
}
