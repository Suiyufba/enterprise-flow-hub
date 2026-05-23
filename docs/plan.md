# Enterprise Flow Hub Plan

## 1. One-Sentence Positioning

Enterprise Flow Hub is a lightweight information integration and automation platform for small businesses that already use scattered tools but lack a technical owner to connect them.

In plain language:

> We help small companies connect spreadsheets, chat tools, CRM records, forms, payment status, documents, and team follow-ups so owners can see the real business state and employees stop moving data by hand.

## 2. Why This Direction Exists

Many small companies do not have a software shortage. They already use many tools:

- WeChat or WeCom for customer communication
- Feishu or DingTalk for internal collaboration
- Excel or online sheets for customer and order tracking
- lightweight CRM systems
- payment records from bank, Stripe, Alipay, WeChat Pay, or manual finance sheets
- email for external communication
- cloud drives for contracts and documents

The real pain is that these tools do not form one operating system. Information is repeated, delayed, forgotten, or invisible to the owner.

Typical symptoms:

- leads are scattered across chat, forms, and spreadsheets
- employees forget to follow up after a quote or consultation
- finance, sales, and operations each maintain separate versions of the truth
- the owner asks for updates in group chats instead of seeing a live dashboard
- approvals and todos sit in different systems
- failed syncs are invisible until a customer complains

The opportunity is to become a lightweight automation CTO for these companies.

## 3. What We Learned From The Reference Code

The studied enterprise API projects are not ideal startup products, but they reveal real enterprise integration patterns.

### 3.1 Common Structure

The reference projects often separate code into:

- boot module: customer-specific controllers, services, scheduled jobs, and startup configuration
- common module: HTTP clients, retry utilities, response wrappers, logging, shared configuration
- standard module: shared DTOs for users, departments, claims, vouchers, invoices, workflows, todos, files, and master data
- log module: API request logging and exception handling

This suggests a useful product architecture:

- product frontend
- public API backend
- connector runtime
- shared object model
- workflow engine
- log and retry center

### 3.2 Repeated Enterprise Integration Themes

The most repeated business domains are:

- user and department synchronization
- approval workflow callbacks
- todo push and todo status update
- finance or invoice callbacks
- budget and rule checks
- master data synchronization
- scheduled repair jobs
- message push to chat tools
- API logging and failure handling

For our product, these become generic modules:

- Identity Connector
- Workflow Event Router
- Todo Center
- Finance Sync
- Master Data Hub
- Rule Engine
- Notification Connector
- Retry and Audit Center

### 3.3 What To Avoid

The reference projects are heavy, customer-specific, and difficult to productize directly.

Avoid:

- building a giant Spring Boot multi-module system before product validation
- hardcoding one customer's workflow into the platform core
- starting with enterprise-grade complexity such as full BPMN, full ERP, or full custom workflow designer
- selling "a platform" before solving one painful workflow

## 4. Target Customer Segment

The first version should not target every small business. It should start with a segment where:

- the owner cares about process visibility
- the team already uses multiple tools
- lost follow-up directly loses revenue
- workflows are repetitive enough to templatize
- the buying decision can be made by one owner or manager

Recommended first segments:

1.留学/移民/教育咨询机构

- lead sources are scattered: Xiaohongshu, WeChat, forms, referrals, websites
- customer status is long-running: new lead, consulted, quoted, signed, document preparation, submitted, completed
- many documents and reminders are involved
- owners care strongly about conversion rate and consultant performance

2.小型 B2B 销售公司

- sales cycle is longer than one conversation
- quotes, contracts, payment, delivery, and renewal need tracking
- CRM is often incomplete or poorly maintained

3.小型贸易/经销团队

- orders, inventory, customer status, payment, delivery, and after-sales are fragmented
- the owner needs a daily operating dashboard

Recommended first choice:

> 留学/移民/教育咨询机构

Reason: the workflow is understandable, reachable through founder network, and does not require deep integration with complex ERP systems at the beginning.

## 5. MVP Scope

The MVP should solve one core promise:

> No lead or customer follow-up is forgotten, and the owner can see the real business pipeline every day.

### 5.1 MVP Features

1. Lead Intake

- manual lead entry
- CSV import
- form webhook endpoint
- basic source field: WeChat, Xiaohongshu, referral, website, walk-in, other

2. Customer Pipeline

Default stages:

- new lead
- contacted
- consultation booked
- consultation completed
- quoted
- signed
- document preparation
- submitted
- completed
- lost

3. Follow-Up Rules

Basic rules:

- if a new lead has no owner after 2 hours, alert manager
- if a lead has no follow-up for 2 days, create task
- if quoted but not signed after 3 days, remind consultant
- if signed and documents are incomplete, remind responsible person

4. Owner Dashboard

Dashboard cards:

- new leads this week
- leads by source
- conversion by stage
- overdue follow-ups
- signed amount this month
- consultant workload

5. Task Inbox

- assigned user
- due date
- related customer
- task status
- task source: manual, rule, webhook, import

6. Activity Timeline

Each customer should have:

- stage changes
- notes
- tasks
- file checklist events
- imported messages or external events

7. Weekly Report

Automatically generate a weekly summary:

- new leads
- signed customers
- lost customers
- overdue follow-ups
- consultant ranking
- suggested actions

8. Audit And Failure Log

Every automation should record:

- trigger time
- input payload
- action result
- failure reason
- retry count
- manual retry button later

This is directly inspired by the enterprise API samples. Sync failure visibility is a product feature, not an internal detail.

## 6. Product Architecture

## 6.1 Monorepo Layout

```text
enterprise-flow-hub/
  frontend/
    app/
    components/
    features/
    lib/
  backend/
    src/
      api/
      auth/
      connectors/
      workflows/
      jobs/
      audit/
      domain/
      db/
  docs/
  scripts/
```

## 6.2 Frontend Responsibilities

The frontend is the operating console.

Main surfaces:

- login and organization switcher
- owner dashboard
- customer pipeline board
- customer detail timeline
- task inbox
- workflow rules page
- connector settings
- import center
- sync/failure logs
- weekly report page

Design direction:

- dense, clear, operational interface
- no marketing-style homepage inside the product
- tables, filters, tabs, side panels, and dashboards
- optimized for repeated daily use by owners and small teams

## 6.3 Backend Responsibilities

The backend is the integration and automation core.

Main modules:

- API module: REST endpoints for frontend and external webhooks
- Domain module: customers, leads, tasks, stages, users, organizations
- Connector module: Feishu, WeCom, CSV, forms, email, future CRM connectors
- Workflow module: triggers, conditions, actions
- Job module: scheduled checks and async processing
- Audit module: event logs, request logs, failure logs
- Report module: weekly summaries and dashboard aggregation

## 6.4 Data Model Draft

Core tables:

- organizations
- users
- memberships
- customers
- customer_stages
- customer_activities
- tasks
- workflow_rules
- workflow_runs
- connectors
- connector_accounts
- webhook_events
- audit_logs
- sync_failures
- report_snapshots

Important normalized objects:

- Person
- Organization
- Customer
- Lead
- Task
- WorkflowEvent
- ExternalAccount
- ExternalMessage
- FileChecklist
- PaymentStatus

## 7. Technical Stack

Recommended MVP stack:

- Language: TypeScript
- Frontend: Next.js
- Backend: Fastify or NestJS
- Database: PostgreSQL
- ORM: Drizzle or Prisma
- Queue: BullMQ
- Cache and queue backend: Redis
- Auth: Auth.js for web MVP or custom JWT if API-first
- Deployment: Vercel for frontend, Railway/Fly.io/Render/VPS for backend and database
- Observability: structured logs first, then OpenTelemetry later

Preferred first implementation:

- Next.js frontend
- Fastify backend
- PostgreSQL + Drizzle
- Redis + BullMQ

Reason:

- fast enough to build
- easier than Java Spring Boot for one founder
- less ceremony than NestJS
- good fit for webhook-heavy products
- TypeScript can share schemas between frontend and backend

## 8. Connector Strategy

The connector system should be productized from day one, but not overengineered.

### 8.1 Connector Interface

Each connector should expose:

- config schema
- auth method
- test connection
- pull data
- push data
- receive webhook
- normalize event
- retry policy

Example interface:

```ts
type Connector = {
  key: string;
  name: string;
  testConnection(config: unknown): Promise<ConnectorHealth>;
  handleWebhook(payload: unknown): Promise<WorkflowEvent[]>;
  pushAction(action: ConnectorAction): Promise<ConnectorResult>;
};
```

### 8.2 First Connectors

Do not start with every platform.

First connector list:

- CSV import
- manual form webhook
- Feishu bot notification
- WeCom or WeChat notification if feasible
- email notification

Second wave:

- Feishu sheet
- Airtable
- Google Sheets
- Notion database
- simple CRM import

Third wave:

- payment systems
- accounting systems
- e-commerce systems
- industry-specific CRMs

## 9. Workflow Engine

Start with simple rule-based automation, not a full visual workflow engine.

Rule format:

- trigger
- condition
- action
- schedule or delay

Example:

```json
{
  "trigger": "customer.stage_changed",
  "conditions": [
    { "field": "stage", "equals": "quoted" }
  ],
  "actions": [
    { "type": "create_task", "delayHours": 72, "title": "Follow up quoted customer" },
    { "type": "notify_user", "channel": "feishu" }
  ]
}
```

MVP triggers:

- customer.created
- customer.stage_changed
- task.overdue
- form.submitted
- file.missing
- schedule.daily
- schedule.weekly

MVP actions:

- create task
- send notification
- change stage
- add timeline note
- create weekly report

## 10. Go-To-Market Plan

### 10.1 First 10 Customers

Target:

- small education agencies
- immigration consultants
- study abroad consultants
- training institutions with sales consultants

Outreach message:

> 我帮你把客户线索、顾问跟进、材料状态和老板看板串起来。先不换你现有工具，只把漏跟进、重复填表、老板看不到状态的问题解决掉。

Offer:

- free 30-minute workflow diagnosis
- paid setup package after diagnosis
- 2-week pilot

### 10.2 Service-First Pricing

Do not sell pure SaaS first.

Suggested pricing:

- workflow diagnosis: RMB 499-1999
- setup package: RMB 3000-15000
- monthly maintenance: RMB 599-2999
- SaaS subscription later: RMB 199-999 per month depending on seats and automation volume

Reason:

- early customers need confidence, not a login page
- service revenue funds product development
- repeated service work reveals templates

### 10.3 Productization Path

Phase 1:

- manual setup
- CSV import
- custom fields
- dashboard
- reminders

Phase 2:

- reusable templates by industry
- connector setup UI
- workflow rule UI
- weekly AI report

Phase 3:

- marketplace of connectors
- advanced permissions
- more robust audit and compliance
- self-serve onboarding

## 11. First 30-Day Build Plan

### Week 1: Foundation

- create monorepo
- choose backend framework
- set up PostgreSQL schema
- implement organizations, users, customers, tasks
- implement customer pipeline stages
- create frontend shell and dashboard layout

### Week 2: Core Workflow

- customer CRUD
- stage changes
- activity timeline
- task inbox
- overdue task detection
- basic rule engine

### Week 3: Integration Layer

- CSV import
- generic webhook endpoint
- notification action
- audit logs
- failure logs
- manual retry skeleton

### Week 4: Demo And Pilot

- owner dashboard
- weekly report generator
- seed demo data for education agency
- create demo script
- interview 10 target users
- sell 1 paid setup pilot

## 12. Key Risks

### Risk 1: Becoming Custom Outsourcing

Mitigation:

- choose one vertical first
- every custom feature must map to a reusable template
- limit integrations in pilot
- charge setup fees

### Risk 2: Tool Fragmentation

Mitigation:

- start with CSV, webhook, and notification
- do not promise deep integration until a customer pays

### Risk 3: Trust And Data Sensitivity

Mitigation:

- clear permission model
- audit logs
- do not store unnecessary chat history
- allow customers to export data
- keep secrets out of code

### Risk 4: Building Too Much Platform

Mitigation:

- first promise is follow-up visibility
- no full workflow designer in MVP
- no marketplace in MVP
- no full ERP replacement

## 13. Product Principles

1. Do not replace existing tools unless necessary.
2. Every automation must be visible and auditable.
3. Failed automation must become a human task.
4. Start with one vertical and one painful workflow.
5. Prefer boring reliable integrations over fancy AI.
6. AI should summarize, classify, and suggest. It should not be the core dependency for basic operations.
7. The owner dashboard is the product's emotional center.

## 14. AI Usage

AI should be added where it reduces manual operations:

- classify lead intent from notes
- summarize weekly pipeline changes
- generate follow-up suggestions
- detect risky customers from inactivity
- extract fields from uploaded spreadsheets
- produce owner-facing reports

AI should not be required for:

- task creation
- reminders
- audit logs
- stage changes
- permission checks
- billing

## 15. Initial Definition Of Done

The first useful demo is done when:

- a demo education agency has 100 sample leads
- the owner dashboard shows pipeline and overdue follow-ups
- a consultant can move customers across stages
- a rule can create a follow-up task after inactivity
- a weekly report can be generated
- all workflow runs are logged
- failed notification events appear in a failure log

At that point, the product is good enough to show to real business owners.

