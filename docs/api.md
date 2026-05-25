# Enterprise Flow Hub API

Base URL: `http://localhost:4000`

All request/response bodies use `application/json`.

---

## Health

### `GET /health`

Health check endpoint.

**Response 200**

```json
{ "ok": true, "service": "enterprise-flow-hub-backend" }
```

---

## Auth

### `POST /auth/register`

Register a new user under an enterprise.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| enterpriseId | string | yes | existing enterprise ID |
| username | string | yes | 2–40 chars, unique |
| password | string | yes | 4–100 chars |
| displayName | string | yes | 1–60 chars |

**Response 201** — the created `User`

**Response 409** — `{ "error": "用户名已存在或企业不存在" }`

### `POST /auth/login`

Login with username and password.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| username | string | yes |
| password | string | yes |

**Response 200** — the `User` object (without password)

**Response 401** — `{ "error": "用户名或密码错误" }`

### `GET /users`

List users, optionally filtered by enterprise.

**Query params**

| Param | Type | Required |
|-------|------|----------|
| enterpriseId | string | no |

**Response 200** — `User[]`

### `GET /users/:id`

Get a single user.

**Response 200** — `User` | **Response 404**

### `DELETE /users/:id`

Delete a user.

**Response 204** | **Response 404**

---

## Workspace

### `GET /workspace`

Returns the full workspace: enterprises, users, projects, conversations, library items, plugins, and automations.

**Response 200**

```json
{
  "enterprises": [
    { "id": "ent-qihang", "name": "启航留学" }
  ],
  "projects": [
    {
      "id": "proj-qihang-growth",
      "enterpriseId": "ent-qihang",
      "name": "线索增长",
      "description": "优化线索来源、顾问跟进和签约转化。",
      "createdAt": "2026-05-01T00:00:00.000Z"
    }
  ],
  "conversations": [
    {
      "id": "chat-qihang-leads",
      "enterpriseId": "ent-qihang",
      "projectId": "proj-qihang-growth",
      "title": "线索跟进诊断",
      "tags": ["跟进", "线索管理"],
      "createdAt": "2026-05-12T00:00:00.000Z"
    }
  ],
  "libraryItems": [
    {
      "id": "lib-qihang-leads-sheet",
      "enterpriseId": "ent-qihang",
      "projectId": "proj-qihang-growth",
      "name": "线索表截图样例",
      "type": "screenshot",
      "summary": "包含客户来源、顾问、阶段和最近跟进时间。",
      "visibility": "public",
      "createdAt": "2026-05-16T00:00:00.000Z"
    }
  ],
  "plugins": [
    {
      "id": "plugin-feishu",
      "name": "飞书多维表格",
      "description": "读取表格字段并生成流程诊断。",
      "enabled": true
    }
  ],
  "automations": [
    {
      "id": "auto-qihang-overdue",
      "projectId": "proj-qihang-growth",
      "name": "报价超时跟进提醒",
      "trigger": "客户在已报价阶段停留超过 3 天",
      "triggerType": "schedule",
      "action": "飞书通知负责顾问 + 同步老板看板",
      "actionType": "notify",
      "agentModel": "claude-opus-4-7",
      "systemPrompt": "你是销售管理助手...",
      "enabled": true,
      "runCount": 342,
      "lastRun": "2026-05-24T09:00:00.000Z"
    }
  ]
}
```

---

## Projects

### `GET /projects/:id`

Returns project detail with related enterprise, conversations, library items, and automations.

**Response 200**

```json
{
  "project": {
    "id": "proj-qihang-growth",
    "enterpriseId": "ent-qihang",
    "name": "线索增长",
    "description": "...",
    "createdAt": "2026-05-01T00:00:00.000Z"
  },
  "enterprise": { "id": "ent-qihang", "name": "启航留学" },
  "conversations": [...],
  "libraryItems": [...],
  "automations": [...]
}
```

**Response 404** — `{ "error": "Project not found" }`

### `POST /projects`

Create a new project. If `enterpriseId` is omitted and `enterpriseName` is provided, a new enterprise is created automatically.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| enterpriseId | string | no | existing enterprise ID |
| enterpriseName | string | no | 1–80 chars, used when enterpriseId is absent |
| name | string | yes | 1–80 chars |
| description | string | no | max 300 chars |

**Response 201** — the created `Project` object

**Response 400** — validation error

### `PATCH /projects/:id`

Update a project's name and/or description.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | no | 1–80 chars |
| description | string | no | max 300 chars |

**Response 200** — the updated `Project` object

**Response 404** — `{ "error": "Project not found" }`

### `DELETE /projects/:id`

Delete a project and all its associated automations, library items, and conversations.

**Response 204** — no content on success

**Response 404** — `{ "error": "Project not found" }`

---

## Library Items

### `POST /library`

Add a library item to a project.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| enterpriseId | string | yes | |
| projectId | string | yes | must refer to an existing project |
| name | string | yes | 1–120 chars |
| type | string | yes | `screenshot` \| `spreadsheet` \| `document` \| `note` |
| summary | string | yes | 1–500 chars |
| visibility | string | yes | `public` \| `private` |

**Response 201** — the created `LibraryItem`

**Response 400** — validation error

**Response 404** — `{ "error": "Project not found" }` (projectId invalid)

### `PATCH /library/:id`

Update a library item. All fields optional — only send what needs to change.

**Request body** (all optional)

| Field | Type | Constraints |
|-------|------|-------------|
| name | string | 1–120 chars |
| type | string | `screenshot` \| `spreadsheet` \| `document` \| `note` |
| summary | string | 1–500 chars |
| visibility | string | `public` \| `private` |

**Response 200** — the updated `LibraryItem`

**Response 404** — `{ "error": "Library item not found" }`

### `DELETE /library/:id`

Delete a library item.

**Response 204** — no content on success

**Response 404** — `{ "error": "Library item not found" }`

---

## Plugins

### `PATCH /plugins/:id`

Enable or disable a plugin.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| enabled | boolean | yes |

**Response 200** — the updated `Plugin`

**Response 400** — `{ "error": "enabled must be boolean" }`

**Response 404** — `{ "error": "Plugin not found" }`

---

## AI Tools

工具层采用统一注册表：产品逻辑只关心工具 ID、输入、权限和审计记录；底层可以是 MCP、CLI、HTTP webhook 或浏览器自动化。

建议策略：

- MCP：适合长期稳定的企业上下文、资料库、CRM/ERP 连接，优势是协议化、权限边界清楚。
- CLI：适合早期交付和客户现场脚本，优势是快、便宜、能调用本机文件和现有脚本。
- HTTP：适合飞书、企业微信、邮件、CRM webhook。
- Browser：适合没有 API 的老后台巡检和录入。

### `GET /tools`

Returns all AI-callable tools and recent tool run records.

**Response 200**

```json
{
  "tools": [
    {
      "id": "tool-csv-profile",
      "name": "CSV/Excel 结构识别",
      "description": "读取表格表头、样例行和缺失字段，给 AI 提供可引用的数据画像。",
      "kind": "cli",
      "status": "enabled",
      "risk": "read_only",
      "inputSchema": "{\"fileName\":\"leads.csv\",\"sampleRows\":20}",
      "examplePrompt": "分析这个线索表，找出顾问漏跟进和字段缺失的问题。",
      "createdAt": "2026-05-20T00:00:00.000Z"
    }
  ],
  "recentRuns": []
}
```

### `PATCH /tools/:id`

Enable, disable, or mark a tool as pending configuration.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| status | string | yes, `enabled` \| `needs_config` \| `disabled` |

**Response 200** — the updated tool

### `POST /tools/:id/run`

Run a tool through the registry. The current implementation records a dry-run simulation so UI, permission, and audit flows are testable before connecting real tools.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| input | object | no |
| dryRun | boolean | no, defaults to `true` |

**Response 201** — a `ToolRun` record

## Skills, Personas, Providers

本产品把一次对话视为一个 Agent 运行：用户选择角色 Persona、能力包 Skill、资料范围 Context，再由后端决定调用哪些 tools 和模型 provider。

默认 provider：

```json
{
  "id": "provider-deepseek",
  "name": "DeepSeek",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "configured": true
}
```

API key 从后端本地环境变量 `DEEPSEEK_API_KEY` 读取，不进入数据库和前端响应。

### `POST /skills`

Create a reusable agent skill.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| name | string | yes |
| description | string | yes |
| toolIds | string[] | no |
| prompt | string | yes |

**Response 201** — the created skill

### `PATCH /skills/:id`

Update or enable/disable a skill.

**Request body** (all optional)

| Field | Type |
|-------|------|
| enabled | boolean |
| name | string |
| description | string |
| toolIds | string[] |
| prompt | string |

### `POST /conversations/:id/messages`

Add a user message and let the selected agent role handle it.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| content | string | yes |
| personaId | string | no |
| skillIds | string[] | no |
| contextScope | string | no, `current_project` \| `selected_projects` \ |
| contextProjectIds | string[] | no |

---

## Automations

### `POST /automations`

Create an automation workflow for a project.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| projectId | string | yes | existing project ID |
| name | string | yes | 1–120 chars |
| trigger | string | yes | 1–200 chars, trigger description |
| triggerType | string | yes | `schedule` \| `message` \| `webhook` \| `email` \| `file` \| `manual` |
| action | string | yes | 1–200 chars, action description |
| actionType | string | yes | `send_email` \| `call_ai` \| `shell` \| `api_call` \| `notify` \| `browser` |
| agentModel | string | no | e.g. `claude-opus-4-7` |
| systemPrompt | string | no | max 500 chars |

**Response 201** — the created `Automation` (starts with `enabled: true`, `runCount: 0`)

**Response 400** — validation error

**Response 404** — `{ "error": "Project not found" }`

### `PATCH /automations/:id`

Enable or disable an automation.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| enabled | boolean | yes |

**Response 200** — the updated `Automation`

**Response 404** — `{ "error": "Automation not found" }`

### `DELETE /automations/:id`

Delete an automation.

**Response 204** — no content on success

**Response 404** — `{ "error": "Automation not found" }`

---

## Conversations

### `GET /conversations/:id`

Returns a conversation with its message history.

**Response 200**

```json
{
  "id": "chat-qihang-leads",
  "enterpriseId": "ent-qihang",
  "projectId": "proj-qihang-growth",
  "title": "线索跟进诊断",
  "tags": ["跟进", "线索管理"],
  "createdAt": "2026-05-12T00:00:00.000Z",
  "messages": [
    {
      "id": "msg-leads-1",
      "role": "user",
      "content": "帮我看这组客户表...",
      "createdAt": "2026-05-12T09:00:00.000Z"
    },
    {
      "id": "msg-leads-2",
      "role": "assistant",
      "content": "好的，我已经分析了客户表...",
      "createdAt": "2026-05-12T09:00:15.000Z"
    }
  ]
}
```

**Response 404** — `{ "error": "Conversation not found" }`

### `POST /conversations`

Create a new conversation.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| enterpriseId | string | yes | |
| projectId | string | yes | |
| title | string | yes | 1–120 chars |

**Response 201** — the created `ConversationDetail` (with empty `messages` array)

### `PATCH /conversations/:id`

Update conversation metadata (title, project, tags).

**Request body** (all optional)

| Field | Type | Constraints |
|-------|------|-------------|
| projectId | string | |
| title | string | 1–120 chars |
| tags | string[] | |

**Response 200** — the updated `ConversationDetail` (with messages)

**Response 404** — `{ "error": "Conversation not found" }`

### `DELETE /conversations/:id`

Delete a conversation and its messages.

**Response 204** — no content on success

**Response 404** — `{ "error": "Conversation not found" }`

### `POST /conversations/:id/messages`

Send a user message to a conversation. The AI auto-replies.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| content | string | yes | 1–2000 chars |

**Response 201** — the AI assistant's reply `Message` object

```json
{
  "id": "msg-abc123",
  "role": "assistant",
  "content": "这是一个模拟回复...",
  "createdAt": "2026-05-24T15:30:00.000Z"
}
```

**Response 404** — `{ "error": "Conversation not found" }`

---

## Analysis

### `POST /analysis`

Submit a business process analysis request.

**Request body**

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| need | string | yes | 1–500 chars |
| businessType | string | no | |
| tools | string | no | |
| screenshotCount | number | yes | 1–8 |

**Response 201** — `AnalysisResult` object

```json
{
  "id": "analysis-abc123",
  "summary": "This looks like a lead tracking spreadsheet...",
  "screenshotTypes": ["spreadsheet", "chat"],
  "businessObjects": ["Lead", "Consultant"],
  "fields": [
    { "name": "customerName", "label": "Customer Name", "type": "text" },
    { "name": "stage", "label": "Stage", "type": "enum", "options": ["new", "contacted", "quoted", "signed", "lost"] }
  ],
  "workflowStages": ["新线索", "已联系", "已报价", "已签约", "已流失"],
  "problems": ["No next follow-up date field..."],
  "automationRules": [
    { "trigger": "lead.created", "condition": "no owner after 2 hours", "action": "alert_manager" }
  ],
  "dashboardMetrics": ["new leads", "overdue follow-ups", "conversion rate"],
  "implementationPlan": ["Create normalized lead table...", "Add automated follow-up..."],
  "createdAt": "2026-05-24T15:30:00.000Z"
}
```

### `GET /analysis/:id`

Retrieve an analysis by ID.

**Response 200** — `AnalysisResult`

**Response 404** — `{ "error": "Analysis not found" }`

### `POST /analysis/:id/export`

Export an analysis in markdown or JSON format.

**Request body**

| Field | Type | Required |
|-------|------|----------|
| format | string | yes — `markdown` \| `json` |

**Response 200** — Markdown text (`Content-Type: text/markdown`) or JSON object

**Response 404** — `{ "error": "Analysis not found" }`

---

## Data Types Reference

### Message

```json
{
  "id": "msg-...",
  "role": "user | assistant",
  "content": "...",
  "createdAt": "ISO 8601"
}
```

### LibraryItem types

| type | description |
|------|-------------|
| `screenshot` | Image/screenshot |
| `spreadsheet` | Excel/CSV table |
| `document` | PDF/Word/text document |
| `note` | Plain-text note |

### Automation triggerType

| value | description |
|-------|-------------|
| `schedule` | Cron/interval based |
| `message` | Chat message received |
| `webhook` | HTTP webhook call |
| `email` | Email received |
| `file` | File created/modified |
| `manual` | User-triggered |

### Automation actionType

| value | description |
|-------|-------------|
| `send_email` | Send an email |
| `call_ai` | Call an AI model |
| `shell` | Execute a shell command |
| `api_call` | Call an external API |
| `notify` | Send a notification |
| `browser` | Browser automation |

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Human-readable error message"
}
```

Or for validation errors:

```json
{
  "error": {
    "fieldErrors": {
      "name": ["Required"],
      "type": ["Invalid enum value"]
    },
    "formErrors": []
  }
}
```

---

## Authentication

When `API_KEY` is configured in the server environment, all endpoints (except `/health`) require the header:

```
Authorization: Bearer <api-key>
```

Requests without a valid key receive `401 { "error": "Unauthorized" }`. In development mode (`API_KEY` not set), authentication is skipped.

---

## Settings

### `GET /settings/providers`

List all configured model providers.

**Response 200** — `{ "providers": [...] }`

### `POST /settings/providers`

Add a new model provider.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | yes | 1–60 chars, custom display name |
| baseUrl | string | yes | 1–200 chars, API base URL |
| model | string | yes | 1–60 chars, model identifier |
| apiKeyEnv | string | yes | 1–60 chars, env variable name holding the key |

**Response 201** — the created `ModelProvider`

### `DELETE /settings/providers/:id`

Remove a model provider.

**Response 204** | **Response 404**

### `POST /settings/providers/:id/test`

Test connectivity to a model provider by sending a minimal API call.

**Response 200** — `{ "ok": true, "message": "连接成功" }` or `{ "ok": false, "message": "..." }`

### `GET /settings/personas`

List all agent personas (including disabled ones).

**Response 200** — `{ "personas": [...] }`

### `POST /settings/personas`

Create a new agent persona.

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | yes | 1–60 chars |
| role | string | yes | 1–60 chars |
| description | string | yes | 1–300 chars |
| systemPrompt | string | yes | 1–2000 chars |
| providerId | string | yes | must match a provider ID |

**Response 201** — the created `AgentPersona`

### `PATCH /settings/personas/:id`

Update a persona. All fields optional.

**Response 200** — updated `AgentPersona` | **Response 404**

### `DELETE /settings/personas/:id`

**Response 204** | **Response 404**

### `POST /settings/generate-prompt`

Use AI to generate a system prompt based on a description.

| Field | Type | Required |
|-------|------|----------|
| description | string | yes, 1–500 chars |

**Response 200** — `{ "prompt": "..." }`

---

## Tools

### `GET /tools/:id`

Get a single tool definition by ID.

**Response 200** — `ToolDefinition` | **Response 404**
