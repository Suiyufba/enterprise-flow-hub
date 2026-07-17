import type { FastifyInstance } from "fastify";
import { analysisRoutes } from "./analysis.js";
import { auditRoutes } from "./audit.js";
import { authRoutes } from "./auth.js";
import { crmRoutes } from "./crm.js";
import { enterpriseRoutes } from "./enterprise.js";
import { fileRoutes } from "./files.js";
import { ordersRoutes } from "./orders.js";
import { rulesRoutes } from "./rules.js";
import { exportRoutes } from "./export.js";
import { settingsRoutes } from "./settings.js";
import { toolRoutes } from "./tools.js";
import { workspaceRoutes } from "./workspace.js";
import { taskRoutes } from "./tasks.js";
import { dashboardRoutes } from "./dashboard.js";

export async function registerAllRoutes(app: FastifyInstance): Promise<void> {
  await app.register(analysisRoutes);
  await app.register(auditRoutes);
  await app.register(authRoutes);
  await app.register(crmRoutes);
  await app.register(enterpriseRoutes);
  await app.register(fileRoutes);
  await app.register(ordersRoutes);
  await app.register(rulesRoutes);
  await app.register(exportRoutes);
  await app.register(settingsRoutes);
  await app.register(toolRoutes);
  await app.register(taskRoutes);
  await app.register(dashboardRoutes);
  await app.register(workspaceRoutes);
}
