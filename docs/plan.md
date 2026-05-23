# Screenshot-to-Workflow Plan

## 1. Core Idea

Enterprise Flow Hub should start as a screenshot-first AI workflow analyst.

The user does not connect APIs first. The user does not configure a workflow first. The user uploads screenshots of messy business tools and says what they want.

One sentence:

> Drop in screenshots of your business process. AI reads the mess, extracts the workflow, and gives you a clean automation plan.

Chinese positioning:

> 截图给 AI，说出需求，它帮你看懂业务流程、拆字段、找问题、生成自动化方案。

## 2. Why This Is Sharper Than A Traditional SaaS

The original platform idea was useful but too broad: connectors, dashboards, workflows, CRM, tasks, reports. That is a real product direction, but it asks the user to trust us before seeing value.

The screenshot-first idea gives value in the first minute:

1. upload screenshots
2. describe the business pain
3. AI analyzes what is on screen
4. AI outputs fields, workflow, problems, and automation suggestions
5. later, the platform can turn the analysis into templates, connectors, and runnable workflows

This avoids the biggest early problem of enterprise SaaS: onboarding friction.

## 3. Product Promise

The first product promise is not "we integrate everything."

The promise is:

> I can look at your current business software, spreadsheets, chats, and dashboards, then tell you exactly how to clean up the process and automate it.

This can be sold as:

- AI workflow diagnosis
- screenshot-to-table
- screenshot-to-automation
- process cleanup report
- lightweight automation CTO

## 4. User Input

The MVP input should be brutally simple:

- 1 to 8 screenshots
- one sentence need
- optional company type
- optional current tools

Examples:

- "帮我减少客户漏跟进。"
- "这个表格太乱，帮我整理成销售流程。"
- "帮我看这个 CRM 页面该怎么自动提醒顾问。"
- "帮我把订单、付款、交付状态串起来。"
- "我想知道这个后台里哪些信息应该变成老板看板。"

## 5. AI Output

The MVP output should be structured, not just a chat reply.

### 5.1 Screenshot Understanding

AI should identify:

- screenshot type: spreadsheet, CRM, chat, order system, finance page, dashboard, form, document list
- visible entities: customer, lead, order, payment, task, user, department, product, invoice, approval
- visible fields: name, source, status, owner, amount, date, next step, remark
- visible statuses: pending, quoted, signed, paid, delivered, overdue, rejected

### 5.2 Business Interpretation

AI should infer:

- current workflow
- current data model
- where ownership is unclear
- where follow-up can be lost
- where manual copy-paste likely happens
- where a dashboard would help
- where automation is safe
- where human confirmation is still needed

### 5.3 Generated Assets

AI should produce:

- recommended fields
- recommended table structure
- workflow stages
- automation rules
- owner dashboard metrics
- task/reminder list
- failure and audit requirements
- suggested implementation path

Example automation rules:

- if a new lead has no owner after 2 hours, alert manager
- if a quoted customer has no follow-up after 3 days, create task
- if payment status changed to paid, notify operations
- if a document checklist item is missing before deadline, notify responsible person

## 6. What We Learned From The Reference Code

The reference enterprise API projects are still useful. They show what happens after the screenshot analysis becomes real implementation.

Important patterns to steal:

- common module for HTTP clients, retry, response wrappers, and logging
- standard DTO layer for users, departments, invoices, workflows, todos, files, and master data
- boot/customer module for customer-specific endpoints and jobs
- log module for request records and exception handling
- scheduled repair jobs for failed integrations
- todo synchronization and workflow callbacks
- master data synchronization
- notification push to enterprise chat tools

Translated into our product:

- AI Analysis Layer: reads screenshots and extracts workflow structure
- Template Layer: turns extracted structure into reusable tables and rules
- Connector Layer: later connects Feishu, WeCom, sheets, CRM, email, payment, and forms
- Workflow Layer: runs triggers and actions
- Audit Layer: logs every automation and failed sync
- Repair Layer: retries or asks a human to repair failed actions

The first version only needs the AI Analysis Layer and Template Layer. The rest becomes the execution layer after validation.

## 7. MVP Screens

The product can start with only three screens.

### 7.1 Analyze

Inputs:

- screenshot uploader
- need text box
- business type selector

Main action:

- Analyze workflow

### 7.2 Results

Sections:

- detected objects
- detected fields
- inferred workflow
- process problems
- automation opportunities
- recommended dashboard
- suggested table schema

### 7.3 Export

Export formats:

- Markdown diagnosis report
- CSV table template
- JSON workflow rules
- Feishu/Airtable/Notion schema later
- n8n workflow later

## 8. MVP Technical Plan

### 8.1 Frontend

Stack:

- Next.js
- React
- plain CSS first

Frontend modules:

- upload panel
- prompt panel
- analysis result view
- export buttons
- history later

### 8.2 Backend

Stack:

- Fastify
- TypeScript
- PostgreSQL later
- object storage later

Backend endpoints:

- `POST /analysis`
- `GET /analysis/:id`
- `POST /analysis/:id/export`
- `GET /health`

### 8.3 AI Contract

The AI should return strict JSON:

```json
{
  "summary": "This looks like a lead tracking spreadsheet for an education agency.",
  "screenshotTypes": ["spreadsheet", "chat"],
  "businessObjects": ["Lead", "Consultant", "FollowUpTask"],
  "fields": [
    { "name": "customerName", "label": "Customer Name", "type": "text" },
    { "name": "stage", "label": "Stage", "type": "enum" }
  ],
  "workflowStages": ["new", "contacted", "quoted", "signed", "lost"],
  "problems": [
    "No next follow-up date is visible.",
    "Owner field is missing for several leads."
  ],
  "automationRules": [
    {
      "trigger": "lead.stage_changed",
      "condition": "stage == quoted",
      "action": "create_follow_up_task_after_3_days"
    }
  ],
  "dashboardMetrics": ["new leads", "overdue follow-ups", "conversion rate"],
  "implementationPlan": ["Create normalized lead table", "Add overdue reminder rule"]
}
```

## 9. First Demo Scenario

Use an education or migration agency scenario.

Demo input:

- screenshot of messy lead spreadsheet
- screenshot of chat follow-up
- user need: "帮我减少客户漏跟进，让老板每天看到顾问状态。"

Demo output:

- recognizes lead pipeline
- recommends stages
- detects missing owner and next follow-up date
- creates schema
- creates follow-up rules
- proposes owner dashboard
- exports an implementation report

## 10. Business Model

Start as productized service:

- free sample analysis for one screenshot
- paid workflow diagnosis report: RMB 199-999
- setup package: RMB 3000-15000
- monthly automation maintenance: RMB 599-2999

Later SaaS:

- analysis credits
- workflow template generation
- connector execution
- team workspace
- audit and retry center

## 11. 14-Day Build Plan

### Days 1-2

- update product positioning
- build upload-first UI
- define AI JSON output schema

### Days 3-5

- implement backend analysis endpoint
- support local mocked analysis response
- add screenshot metadata handling

### Days 6-8

- connect real vision-capable model
- render structured result sections
- add export to Markdown

### Days 9-11

- create education agency demo data
- polish result quality
- add workflow rule JSON export

### Days 12-14

- record demo
- test with 5 real screenshots from target users
- convert useful outputs into a paid diagnosis offer

## 12. What Not To Build Yet

Do not build these in the MVP:

- full connector marketplace
- full workflow visual builder
- full CRM
- multi-tenant billing
- enterprise permissions
- deep Feishu/WeCom integrations
- complex database modeling UI

Those come after users prove they want to act on the AI diagnosis.

## 13. Definition Of Done

The MVP is useful when:

- user uploads screenshots and enters a need
- AI returns a structured business interpretation
- output includes fields, workflow stages, problems, automation rules, and dashboard metrics
- user can export a diagnosis report
- at least 5 target users say the analysis correctly understood their workflow

