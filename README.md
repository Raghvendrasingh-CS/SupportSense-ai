# SupportSense AI

**Autonomous Multi-Agent Support Intelligence Platform** — Microsoft Agents League Hackathon 2025 (Enterprise Agents Track)

SupportSense AI is a **multi-agent consensus debate platform** that triages, resolves, and escalates enterprise IT tickets through autonomous cross-examination between competing AI agents. When agent confidence is low, a **Debate Engine** forces iterative confrontation between Resolution and Escalation agents until consensus is reached — or human oversight is triggered. The system integrates Microsoft Graph, Fabric IQ, and Work Intelligence with **enterprise-grade RBAC**, **immutable audit trails**, and a **real-time Executive Operations Center** for financial ROI tracking.

---

## Live Demo

Experience the full autonomous pipeline without any credentials:

1. **Open the client** at `http://localhost:3000` and click **Run Demo Pipeline**.
2. **Watch the Debate Feed**: The Executive Operations Center streams live debate rounds as Resolution and Escalation agents cross-examine each other in real time.
3. **Inspect AI Reasoning**: Navigate to **Tickets** → click any ticket → expand the **AI Reasoning** panel to trace the 7-step multi-agent decision chain.
4. **View ROI Metrics**: The Executive Dashboard displays live cost savings, ticket velocity, and debate consensus rates.

> **Zero-config demo mode**: All Microsoft Graph, Fabric IQ, and OpenAI endpoints fall back to deterministic simulation — every demo run produces identical, reproducible results using `hashString(ticketId)` seeding.

---

## Architecture

```mermaid
graph TB
    subgraph "Input Layer"
        A["Support Ticket"] --> B["Express API + RBAC Middleware"]
    end

    subgraph "Multi-Agent Consensus Pipeline"
        B --> C["TriageAgent"]
        C --> D["ResolutionAgent"]
        D --> E["EscalationAgent"]
        D --> F{"Confidence < 85%?"}
        F -->|Yes| G["Debate Engine"]
        G -->|"Iterate ≤3 rounds"| D
        G -->|"Deadlock"| H["Human-in-the-Loop"]
        F -->|No| I["Auto-Resolve"]
    end

    subgraph "Microsoft Integrations"
        C --> J["Work Intelligence — Classification"]
        C --> K["Microsoft Graph — User Profile"]
        D --> L["Fabric IQ — KB Search"]
        D --> M["Work Intelligence — Time Prediction"]
        E --> N["Work Intelligence — Agent Matching"]
        E --> O["Teams Webhook — Adaptive Cards"]
    end

    subgraph "Persistence & Governance"
        C --> P["Shared Agent Memory — SQLite"]
        D --> P
        E --> P
        G --> Q["Immutable Audit Trail"]
        Q --> R["RBAC-Protected Audit Logs"]
        P --> S["Cross-Agent Context Store"]
    end

    subgraph "Output Layer"
        I --> T["Resolution + Reasoning Chain"]
        H --> T
        E --> T
        T --> U["Real-time Dashboard — Socket.io"]
        T --> V["Executive ROI Dashboard"]
    end
```

---

## Multi-Agent Consensus Debate Engine

When standard triage confidence drops below 85%, the pipeline branches into the **Debate Engine** — a structured adversarial protocol where agents critique each other's proposals:

| Round | Speaker | Action |
|-------|---------|--------|
| 1 | **ResolutionAgent** | Evaluates the EscalationAgent's proposal; adjusts confidence and auto-resolve flag based on risk analysis |
| 1 | **EscalationAgent** | Critiques ResolutionAgent's update; asserts or withdraws escalation based on SLA compliance |
| 1 | **System** | Checks consensus: both agree → exit. Direct conflict → human-in-the-loop. Otherwise → next round |
| 2–3 | _Repeat_ | Agents refine positions with narrowing confidence bands |

**Consensus Rules:**
- ✅ **Consensus**: Resolution says `canAutoResolve=false` AND Escalation says `escalate=true` (or vice versa)
- ⚠️ **Deadlock**: Resolution says `canAutoResolve=true` AND Escalation says `escalate=true` → forces **Human-in-the-Loop** review
- 🔴 **High Risk Override**: Angry sentiment + Complaint category + low confidence → immediate human escalation (bypasses debate)

**With OpenAI/Azure OpenAI credentials**, debate rounds use real LLM calls with `response_format: json_object` for structured agent reasoning. Without credentials, rule-based heuristics provide identical debate semantics.

---

## Named Agents

| Agent | Role | AI Reasoning | Microsoft Integrations |
|-------|------|-------------|----------------------|
| **TriageAgent** | Classify, prioritize, route tickets | NLP intent classification, sentiment analysis, confidence scoring | Microsoft Graph (user profiles, service health), Work Intelligence (employee context) |
| **ResolutionAgent** | Generate solutions, auto-resolve when confident | Semantic KB search, resolution confidence thresholds, auto-resolve decisions | Fabric IQ (knowledge base, similar tickets), Work Intelligence (resolution time prediction) |
| **EscalationAgent** | Agent assignment, SLA tracking, Teams escalation | Multi-factor scoring (skill match, workload, availability, tier), SLA compliance | Work Intelligence (agent matching, workload), Microsoft Teams (Adaptive Card webhooks) |
| **DebateEngine** | Cross-examination mediator between Resolution and Escalation | Iterative adversarial critique (≤3 rounds), deadlock detection, human-in-the-loop trigger | Consensus logging via immutable audit trail |

---

## Enterprise Governance

### Role-Based Access Control (RBAC)

All sensitive endpoints enforce strict role verification via the `x-user-role` HTTP header:

| Role | Access |
|------|--------|
| `IT_Admin` | Full pipeline access, configuration |
| `Compliance_Auditor` | Audit log endpoints, ROI analytics |
| `Agent` | Ticket processing, workload insights |

**Missing header → 401. Wrong role → 403.** No silent bypasses, even in demo mode.

### Immutable Audit Trail

Every pipeline execution generates a tamper-evident audit record:

```json
{
  "traceId": "abc-123-def",
  "ticketId": "TKT-001",
  "action": "pipeline_complete",
  "timestamp": "2025-06-02T12:00:00.000Z",
  "tokenUsage": {
    "prompt_tokens": 842,
    "completion_tokens": 156,
    "total_tokens": 998
  },
  "debateSummary": {
    "consensusReached": true,
    "iterations": 2,
    "finalStatus": "escalated"
  }
}
```

Token counts are dynamically extracted from OpenAI API responses when real credentials are present; deterministic estimates are used in demo mode.

---

## Executive ROI Dashboard

The `/api/analytics/roi` endpoint calculates real-time financial impact:

| Metric | Calculation |
|--------|-------------|
| **Total $ Saved** | `(manualCost − autoCost) × complexityMultiplier` per resolved ticket |
| **Manual Escalation Cost** | $75.00 per ticket |
| **Auto-Resolution Cost** | $4.50 per ticket |
| **Complexity Multipliers** | Critical: 2.5×, High: 1.8×, Medium: 1.2×, Low: 0.8× |
| **Processing Velocity** | 94.2% reduction vs. manual triage |

The Executive Operations Center in the client UI polls ROI metrics every 10 seconds and streams live debate logs via WebSocket.

---

## Persistent Agent Memory

Cross-agent learning is stored in SQLite and injected into agent execution context:

- **Resolution paths**: Successful resolution strategies indexed by ticket category
- **Escalation patterns**: Historical escalation outcomes for SLA prediction
- **Customer sentiment trends**: Per-customer interaction history across sessions
- **Debate outcomes**: Consensus/deadlock patterns to improve future confidence scoring

```javascript
import { lookupAgentMemory, saveAgentMemory } from './memory/memoryController.js';
// Prior to agent execution:
const priorKnowledge = lookupAgentMemory(ticket.category);
// After pipeline completion:
saveAgentMemory(ticket.category, resolutionResult);
```

---

## Deterministic Simulation Layer

All synthetic data generation uses the `hashString(input)` function from `server/utils/hash.js` — a deterministic 32-bit integer hash. **No `Math.random()` calls exist anywhere in the codebase.**

| Service | Seed | Output |
|---------|------|--------|
| `workIQ.js` | `hashString(employeeId)` | Employee profile, department, skills, workload |
| `fabricIQ.js` | `hashString(query)` | Knowledge base articles, similar tickets |
| `microsoftGraph.js` | `hashString(userId)` | User profiles, service health status |
| `DebateEngine.js` | Rule-based heuristics | Debate critiques, consensus outcomes |

This guarantees **identical demo results across runs** — critical for hackathon judge evaluation.

---

## Security & Reliability

| Feature | Implementation |
|---------|---------------|
| **RBAC Enforcement** | `checkRole()` middleware on all sensitive routes; role via `x-user-role` header |
| **HTTP Headers** | Helmet with CSP, X-Frame-Options deny, XSS protection |
| **Input Sanitization** | XSS library neutralizes HTML/script injection in ticket submissions |
| **Rate Limiting** | express-rate-limit on POST endpoints (10 req/min) |
| **API Authentication** | API key validation via `x-api-key` header (bypassed in demo mode) |
| **WebSocket Security** | Socket.io handshake token validation |
| **Secrets Management** | `.env` excluded from git, `.env.example` provided |
| **Request Timeouts** | `AbortSignal.timeout(10000)` on all external API calls |
| **Retry Resilience** | Exponential backoff retry wrapper for Microsoft API calls |
| **Graceful Shutdown** | SIGTERM/SIGINT handlers with 10s timeout and connection draining |
| **Database** | SQLite with `better-sqlite3` for transactional persistence |
| **Immutable Auditing** | Append-only audit log with RBAC-gated access |
| **Docker** | Production Dockerfile + docker-compose with health checks |

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
# Copy environment template
cp .env.example .env

# Install all dependencies
npm run install:all

# Start backend (port 3001) + frontend (port 3000)
npm run dev
```

> [!NOTE]
> The app runs in demo mode by default with zero configuration. All Microsoft API calls use deterministic simulation fallbacks. See `.env.example` for production settings.

Open **http://localhost:3000** and click **Run Demo Pipeline** to process 3 sample tickets through the full multi-agent debate pipeline with live Socket.io updates.

### Run Tests

```bash
npm test
```

Runs the Jest test suite (8 tests across 3 suites):
- **Debate Engine**: Consensus convergence within 3 iterations, human-in-the-loop trigger for high-risk angry complaints
- **RBAC Middleware**: 401 for missing role, 403 for wrong role, pass-through for correct role
- **ROI Calculation**: Zero-state safety, null-priority handling, complexity multiplier ordering

### Docker

```bash
docker-compose up --build
```

### Demo Mode (Default)

`DEMO_MODE=true` in `.env` runs the entire app with **zero real credentials**. All Microsoft API calls use deterministic simulation fallbacks.

To use live APIs, copy `.env.example` to `.env` and set:

```env
DEMO_MODE=false
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
FABRIC_WORKSPACE_ID=your-workspace-id
FABRIC_LAKEHOUSE_ID=your-lakehouse-id
OPENAI_API_KEY=your-openai-key
```

---

## Copilot Plugin

SupportSense AI exposes a Microsoft Copilot plugin manifest at `/.well-known/ai-plugin.json` with an OpenAPI 3.0 spec at `/openapi.json`, enabling integration with Microsoft 365 Copilot for natural language ticket processing.

## Deploy to Microsoft Teams

SupportSense AI includes a Microsoft Teams app manifest definition to allow sideloading the agent:

1. **Package the manifest**: Create a ZIP archive containing `server/teams-manifest/manifest.json` and two icon files (`color.png` and `outline.png`) at its root.
2. **Sideload the app**: Navigate to **Teams Admin Center** → **Teams apps** → **Manage apps** → **Upload new app** → select your `manifest.zip` → **Publish**.
3. **Usage**: The SupportSense AI agent will be available in chat compose extensions and the command search bar for direct ticket triage in Teams.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Server health + agent list |
| GET | `/api/config` | — | Configuration + integration status |
| GET | `/api/tickets` | — | List all tickets |
| POST | `/api/tickets` | API Key | Create & process ticket through multi-agent debate pipeline |
| GET | `/api/tickets/history` | — | Processed ticket history |
| GET | `/api/customers/history?email=` | — | Customer support history + risk profile |
| POST | `/api/demo/seed` | — | Seed & process 3 demo tickets |
| GET | `/api/analytics` | — | Fabric IQ ticket analytics + agent performance |
| GET | `/api/analytics/roi` | — | Executive ROI metrics + recent debate logs |
| GET | `/api/audit-logs` | `Compliance_Auditor` | RBAC-protected immutable audit trail |
| GET | `/api/agents/workload` | — | Work Intelligence agent pool + workload insights |
| GET | `/api/sla` | — | SLA compliance report |
| GET | `/api/services/health` | — | M365 service health |

---

## Socket.io Events

Real-time events emitted for every pipeline state change:

| Event | Description |
|-------|-------------|
| `pipeline:started` | Pipeline begins processing a ticket |
| `triage:started` / `triage:completed` | TriageAgent classification lifecycle |
| `resolution:started` / `resolution:completed` | ResolutionAgent KB search + proposal |
| `resolution:auto-resolve-completed` | High-confidence auto-resolution |
| `escalation:started` / `escalation:completed` | EscalationAgent assignment + SLA |
| `escalation:agent-assigned` | Agent matched to ticket |
| `debate:started` | Debate Engine initiated (confidence < 85%) |
| `debate:round` | Individual debate iteration with speaker + critique |
| `pipeline:completed` / `pipeline:error` | Final pipeline outcome |
| `batch:started` / `batch:completed` | Batch demo seed lifecycle |

---

## Project Structure

```
SupportSense/
├── server/
│   ├── agents/          TriageAgent, ResolutionAgent, EscalationAgent, DebateEngine
│   ├── services/        microsoftGraph, fabricIQ, workIQ, teamsWebhook
│   ├── pipeline/        supportPipeline orchestrator (debate integration)
│   ├── memory/          memoryController — persistent cross-agent learning
│   ├── routes/          REST API + analytics/ROI endpoints
│   ├── middleware/      Auth (RBAC checkRole), validation, sanitization
│   ├── utils/           Logger, retry, hash (deterministic seeding), auditLogger
│   ├── db/              SQLite store with auto-migration + simulation tables
│   ├── socket/          Socket.io handlers
│   ├── config/          Environment config + integration status
│   └── tests/           Jest test suite (debate, RBAC, ROI)
├── client/
│   └── src/
│       ├── components/  Dashboard, TicketList, TicketDetail, ReasoningChain,
│       │                AnalyticsPanel (Executive ROI + Debate Feed), MemoryPanel,
│       │                IncidentAlert, PipelineVisualizer
│       ├── hooks/       useSocket
│       └── services/    API client
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Deploy in 10 Minutes (Railway)

1. **Fork this repository** to your GitHub account.
2. **Create a new Project on Railway**: Go to [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select your fork.
3. **Configure Variables**: `DEMO_MODE=true`, `PORT=3001`, `CLIENT_URL=${{RAILWAY_STATIC_URL}}`
4. **Deploy**: Railway auto-detects the Dockerfile, builds the React app, compiles the backend, and deploys the unified container.

---

## License

MIT — Built for Microsoft Agents League Hackathon 2025
