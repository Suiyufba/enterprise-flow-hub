# Enterprise Flow Hub

Enterprise Flow Hub is a lightweight TypeScript monorepo for building a small-business information integration platform.

The goal is to help small companies connect scattered tools such as spreadsheets, CRM systems, Feishu, WeCom, email, payment records, and internal workflows without replacing everything they already use.

## Structure

- `frontend/` - product UI, dashboards, workflow builder, customer-facing console
- `backend/` - API service, connector runtime, workflow execution, webhook gateway
- `docs/` - business plan, architecture notes, product decisions
- `scripts/` - local automation scripts

## Product Direction

The first version should focus on one narrow customer segment and one painful workflow. The platform idea is:

1. collect data from existing tools
2. normalize it into shared business objects
3. trigger simple workflow rules
4. show owners a real-time operating dashboard
5. alert humans when sync, approval, or follow-up fails

See [docs/plan.md](docs/plan.md) for the detailed plan.

