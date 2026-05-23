# Enterprise Flow Hub

Enterprise Flow Hub starts as a screenshot-first AI workflow analyst for small businesses.

The first product is simple: upload screenshots of messy business tools, describe what you want, and let AI extract the workflow, fields, problems, dashboard metrics, and automation plan.

The later platform can execute those plans through connectors, workflows, logs, and retry systems.

## Structure

- `frontend/` - screenshot upload UI, analysis results, exports, later workflow console
- `backend/` - analysis API, AI orchestration, export generation, later connector runtime
- `docs/` - business plan, architecture notes, product decisions
- `scripts/` - local automation scripts

## Product Direction

The first version should avoid heavy integration setup. The product flow is:

1. upload 1-8 screenshots
2. describe the business need
3. AI identifies business objects, fields, stages, and process gaps
4. AI generates automation rules, dashboard metrics, and a cleanup plan
5. the user exports a report or turns it into implementation work

See [docs/plan.md](docs/plan.md) for the detailed plan.
