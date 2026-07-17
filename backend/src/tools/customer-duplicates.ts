import { getDb } from "../db/index.js";

type DuplicateKey = {
  key: string;
  count: number;
};

type CustomerDetail = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  status: string;
  created_at: string;
};

function compactPhone(column = "phone"): string {
  return `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(${column}),' ',''),'-',''),'(',''),')',''),'+',''),'.','')`;
}

function normalizedPhone(column = "phone"): string {
  const compact = compactPhone(column);
  return `(CASE
    WHEN LENGTH(${compact}) = 13 AND SUBSTR(${compact},1,2) = '86' THEN SUBSTR(${compact},3)
    WHEN LENGTH(${compact}) = 15 AND SUBSTR(${compact},1,4) = '0086' THEN SUBSTR(${compact},5)
    ELSE ${compact}
  END)`;
}

function matchExpression(field: "phone" | "email" | "name"): string {
  if (field === "phone") return normalizedPhone();
  return `LOWER(TRIM(${field}))`;
}

function listDuplicateGroups(enterpriseId: string, field: "phone" | "email" | "name", projectId?: string): DuplicateKey[] {
  const expression = matchExpression(field);
  const projectClause = projectId ? "AND project_id = ?" : "";
  const params = projectId ? [enterpriseId, projectId] : [enterpriseId];
  return getDb().prepare(
    `WITH normalized AS (
       SELECT ${expression} AS match_key
       FROM customers
       WHERE enterprise_id = ? ${projectClause}
     )
     SELECT match_key AS key, COUNT(*) AS count
     FROM normalized
     WHERE match_key <> ''
     GROUP BY match_key
     HAVING COUNT(*) > 1
     ORDER BY count DESC, match_key ASC`,
  ).all(...params) as DuplicateKey[];
}

function customersForKey(enterpriseId: string, field: "phone" | "email" | "name", key: string, projectId?: string): CustomerDetail[] {
  const projectClause = projectId ? "AND project_id = ?" : "";
  const params = projectId ? [enterpriseId, projectId, key] : [enterpriseId, key];
  return getDb().prepare(
    `SELECT id,name,contact,phone,email,status,created_at
     FROM customers
     WHERE enterprise_id = ? ${projectClause} AND ${matchExpression(field)} = ?
     ORDER BY created_at ASC, id ASC`,
  ).all(...params) as CustomerDetail[];
}

function aggregate(groups: DuplicateKey[]) {
  return {
    groups: groups.length,
    customerRecords: groups.reduce((sum, group) => sum + group.count, 0),
    redundantRecords: groups.reduce((sum, group) => sum + group.count - 1, 0),
  };
}

function details(enterpriseId: string, field: "phone" | "email" | "name", groups: DuplicateKey[], limit: number | undefined, projectId?: string) {
  return groups.slice(0, limit).map((group) => ({
    normalizedValue: group.key,
    count: group.count,
    customers: customersForKey(enterpriseId, field, group.key, projectId),
  }));
}

export function listDuplicatePhoneGroups(enterpriseId: string, projectId?: string): DuplicateKey[] {
  return listDuplicateGroups(enterpriseId, "phone", projectId);
}

export function listCustomersByNormalizedPhone(enterpriseId: string, normalizedValue: string, projectId?: string): CustomerDetail[] {
  return customersForKey(enterpriseId, "phone", normalizedValue, projectId);
}

export function customerDuplicateReport(enterpriseId: string, requestedDetailLimit?: number, projectId?: string) {
  const detailLimit = requestedDetailLimit === undefined ? undefined : Math.max(0, Math.trunc(requestedDetailLimit));
  const db = getDb();
  const scannedCustomers = (db.prepare(
    `SELECT COUNT(*) AS count FROM customers WHERE enterprise_id = ? ${projectId ? "AND project_id = ?" : ""}`,
  ).get(...(projectId ? [enterpriseId, projectId] : [enterpriseId])) as { count: number }).count;
  const phoneGroups = listDuplicateGroups(enterpriseId, "phone", projectId);
  const emailGroups = listDuplicateGroups(enterpriseId, "email", projectId);
  const nameGroups = listDuplicateGroups(enterpriseId, "name", projectId);
  const phone = aggregate(phoneGroups);
  const email = aggregate(emailGroups);
  const name = aggregate(nameGroups);

  return {
    summary: {
      scope: projectId ? "current_project_customers" : "all_enterprise_customers",
      projectId: projectId ?? null,
      completeScan: true,
      scannedCustomers,
      hasStrongDuplicates: phone.groups > 0 || email.groups > 0,
      hasPotentialNameDuplicates: name.groups > 0,
      duplicatePhoneGroups: phone.groups,
      duplicatePhoneCustomerRecords: phone.customerRecords,
      redundantPhoneRecords: phone.redundantRecords,
      duplicateEmailGroups: email.groups,
      duplicateEmailCustomerRecords: email.customerRecords,
      redundantEmailRecords: email.redundantRecords,
      sameNameCandidateGroups: name.groups,
      sameNameCandidateCustomerRecords: name.customerRecords,
    },
    detailLimit: detailLimit ?? "all",
    detailsTruncated: {
      phone: detailLimit === undefined ? false : phone.groups > detailLimit,
      email: detailLimit === undefined ? false : email.groups > detailLimit,
      name: detailLimit === undefined ? false : name.groups > detailLimit,
    },
    phoneGroups: details(enterpriseId, "phone", phoneGroups, detailLimit, projectId),
    emailGroups: details(enterpriseId, "email", emailGroups, detailLimit, projectId),
    sameNameCandidateGroups: details(enterpriseId, "name", nameGroups, detailLimit, projectId),
    notes: [
      "电话和邮箱重复属于强重复证据；同名仅作为待人工确认候选。",
      "summary 基于企业全部客户聚合，detailLimit 只限制返回的重复组明细，不影响总数。",
    ],
  };
}
