# SupportSense AI

**Enterprise Support Intelligence** for the Microsoft Agents League Hackathon 2025 — Enterprise Agents Track (Work IQ + Fabric IQ tier).

SupportSense AI is a three-agent support pipeline that triages, resolves, and escalates enterprise IT tickets using Microsoft Graph, Fabric IQ, and Work IQ — with full demo mode requiring zero credentials.

## Architecture

```
Ticket → TriageAgent → ResolutionAgent → EscalationAgent → Result
              ↓               ↓                  ↓
         Work IQ +       Fabric IQ KB      Work IQ Agent
         Graph API       + Similar Tickets   Matching + SLA
```

### Three Named Agents

| Agent | Role | Integrations |
|-------|------|-------------|
| **TriageAgent** | Classify, prioritize, route | Microsoft Graph, Work IQ, Fabric IQ |
| **ResolutionAgent** | Generate solutions, auto-resolve | Fabric IQ KB, Work IQ predictions |
| **EscalationAgent** | Agent assignment, SLA tracking | Work IQ, Microsoft Graph notifications |

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
# Install all dependencies
npm run install:all

# Start backend (port 3001) + frontend (port 3000)
npm run dev
```

Open **http://localhost:3000** and click **Run Demo Pipeline** to process 3 sample tickets through all three agents with live Socket.io updates.

### Demo Mode (Default)

`DEMO_MODE=true` in `.env` runs the entire app with **zero real credentials**. All Microsoft API calls use working mock fallbacks.

To use live APIs, copy `.env.example` to `.env` and set:

```env
DEMO_MODE=false
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
FABRIC_WORKSPACE_ID=your-workspace-id
FABRIC_LAKEHOUSE_ID=your-lakehouse-id
WORK_IQ_ENDPOINT=your-workiq-endpoint
WORK_IQ_API_KEY=your-workiq-key
OPENAI_API_KEY=your-openai-key
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health + agent list |
| GET | `/api/tickets` | List all tickets |
| POST | `/api/tickets` | Create & process a ticket |
| POST | `/api/demo/seed` | Seed & process 3 demo tickets |
| GET | `/api/analytics` | Fabric IQ ticket analytics |
| GET | `/api/agents/workload` | Work IQ agent pool |
| GET | `/api/sla` | SLA compliance report |
| GET | `/api/services/health` | M365 service health |

## Socket.io Events

Real-time events emitted for every pipeline state change:

- `pipeline:started`, `pipeline:completed`, `pipeline:error`
- `triage:started`, `triage:completed`
- `resolution:started`, `resolution:completed`, `resolution:auto-resolve-completed`
- `escalation:started`, `escalation:completed`, `escalation:agent-assigned`
- `batch:started`, `batch:completed`

## Project Structure

```
SupportSense/
├── server/
│   ├── agents/          TriageAgent, ResolutionAgent, EscalationAgent
│   ├── services/        microsoftGraph, fabricIQ, workIQ
│   ├── pipeline/        supportPipeline orchestrator
│   ├── socket/          Socket.io handlers
│   └── routes/          REST API
├── client/
│   └── src/
│       ├── components/  Dashboard, tickets, analytics, events
│       ├── hooks/       useSocket
│       └── services/    API client
└── .env.example
```

## Hackathon Highlights

- **Work IQ**: Employee context, agent skill matching, workload insights, resolution time prediction
- **Fabric IQ**: Knowledge base search, ticket analytics, similar ticket lookup, event logging
- **Microsoft Graph**: User profiles, notifications, service health, ticket fetching
- **Real-time UI**: Socket.io live event feed + Recharts analytics dashboard
- **Production-ready patterns**: try/catch everywhere, mock fallbacks, processing time tracking

## License

MIT — Built for Microsoft Agents League Hackathon 2025
