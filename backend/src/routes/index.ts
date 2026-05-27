import type { FastifyInstance } from "fastify";
import { analysisRoutes } from "./analysis.js";
import { authRoutes } from "./auth.js";
import { crmRoutes } from "./crm.js";
import { enterpriseRoutes } from "./enterprise.js";
import { ordersRoutes } from "./orders.js";
import { exportRoutes } from "./export.js";
import { settingsRoutes } from "./settings.js";
import { toolRoutes } from "./tools.js";
import { workspaceRoutes } from "./workspace.js";

export async function registerAllRoutes(app: FastifyInstance): Promise<void> {
  await app.register(analysisRoutes);
  await app.register(authRoutes);
  await app.register(crmRoutes);
  await app.register(enterpriseRoutes);
  await app.register(ordersRoutes);
  await app.register(exportRoutes);
  await app.register(settingsRoutes);
  await app.register(toolRoutes);
  await app.register(workspaceRoutes);
}
