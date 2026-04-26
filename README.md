# cf_ai_career-coach

An AI-powered career coaching chatbot built entirely on Cloudflare's developer platform. Chat with it in real time, upload your resume for structured feedback, and it remembers everything you've ever told it across sessions. Runs on a serverless edge-deployed Durable Object — no traditional backend, no database server, no infrastructure to manage.

🔗 **Live demo:** https://cf-ai-career-coach.shiven19p.workers.dev

---

## What it does

The Career Coach is a chat agent that helps software engineers and data scientists with:

- **Resume reviews** — upload a PDF and get a structured analysis (overall impression, top 3 weaknesses, ATS optimization, rewritten bullets, next steps)
- **Mock interview questions** tailored to a target role
- **Job search strategy** and target company recommendations
- **Salary negotiation** advice
- **General early-career guidance**

What makes it different from a generic chatbot is **persistent, per-user memory**. Tell it your name, school, target roles, or upload your resume — close the tab, come back tomorrow, and it picks up exactly where you left off, with all your context intact.

---

## Architecture

The app is a single Cloudflare Worker that serves both the frontend and the agent backend, with a Durable Object holding per-user state.

```
                ┌──────────────────────────────────┐
                │   Browser (chat UI, vanilla JS)  │
                │   - userId in localStorage       │
                │   - PDF.js for client-side       │
                │     resume parsing               │
                └───────────────┬──────────────────┘
                                │ WebSocket
                                ▼
                ┌──────────────────────────────────┐
                │   Cloudflare Worker              │
                │   (src/index.ts, edge-deployed)  │
                │   - serves HTML on GET /         │
                │   - routes /agents/* via         │
                │     Cloudflare Agents SDK        │
                └───────────────┬──────────────────┘
                                │ getAgentByName
                                ▼
                ┌──────────────────────────────────┐
                │   CareerCoachAgent               │
                │   (Durable Object, one per user) │
                │                                  │
                │   ┌────────────────────────────┐ │
                │   │  SQLite storage            │ │
                │   │  (messages table —         │ │
                │   │   role, content, time)     │ │
                │   └────────────────────────────┘ │
                │                                  │
                │   onMessage():                   │
                │   1. Save user message to SQL    │
                │   2. Load last 20 messages       │
                │   3. Call Workers AI             │
                │   4. Save reply to SQL           │
                │   5. Send reply over WebSocket   │
                └───────────────┬──────────────────┘
                                │
                                ▼
                ┌──────────────────────────────────┐
                │   Workers AI                     │
                │   @cf/meta/llama-3.3-70b-        │
                │   instruct-fp8-fast              │
                └──────────────────────────────────┘
```

### Mapping to the Cloudflare assignment requirements

| Required component | Implementation |
|---|---|
| **LLM** | Workers AI running Llama 3.3 70B (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| **Workflow / coordination** | Cloudflare Agents SDK + Durable Objects — one `CareerCoachAgent` instance per user, identified by a stable `userId` |
| **User input via chat** | WebSocket-based real-time chat UI served by the same Worker (vanilla HTML/CSS/JS, no build step). Plus a 📎 PDF upload button for resume analysis. |
| **Memory / state** | Durable Object SQLite storage — every message (including uploaded resume content) is persisted. Last 20 messages are loaded into context per turn. Survives page refreshes, server restarts, and redeploys. |

---

## Key features

### 1. Persistent cross-session memory

This was the hardest and most rewarding part to get right. Originally each browser tab generated a random `userId` per page load, so refreshing the page gave you a fresh agent with no history. The fix:

1. The browser writes its `userId` to `localStorage` on first visit and reuses it on every subsequent visit.
2. The same `userId` always maps to the same Durable Object instance via `getAgentByName`.
3. The Durable Object has its own SQLite database that persists conversation history across requests, restarts, and deployments.

**Verified working:** tell the agent your name, refresh the page, ask "what do you remember about me?" — it correctly recalls the details from prior sessions.

### 2. Resume upload and analysis

Click the 📎 button to upload a PDF resume (up to 5MB):

1. **Client-side PDF parsing** with PDF.js — extracts text from the PDF entirely in the browser, no server bandwidth wasted on the binary file
2. **Structured analysis** — the agent's system prompt instructs it to provide:
   - Overall impression
   - Top 3 weaknesses
   - ATS optimization feedback
   - Rewritten bullets using the XYZ formula
   - Concrete next steps
3. **Persistent context** — the resume content lives in the Durable Object's memory, so follow-up questions like "rewrite the experience section" or "what skills should I add for FAANG roles?" automatically reference the actual resume

---

## Run it locally

### Prerequisites

- Node.js 18 or newer
- A free Cloudflare account
- `wrangler` CLI: `npm install -g wrangler`

### Setup

```bash
git clone https://github.com/<your-username>/cf_ai_career-coach.git
cd cf_ai_career-coach
npm install
wrangler login
```

### Run the dev server

```bash
npm run dev
```

Open http://localhost:8787 in your browser. The chat UI will load. Note that the AI binding is always remote even in local dev (Workers AI inference happens on Cloudflare's GPUs), so you may incur a small amount of usage on your account.

### Deploy your own copy

```bash
npm run deploy
```

You'll get back a URL like `https://cf-ai-career-coach.<your-subdomain>.workers.dev`.

---

## Project structure

```
cf_ai_career-coach/
├── src/
│   └── index.ts          # Worker entry, CareerCoachAgent class, inline frontend
├── wrangler.jsonc        # Cloudflare config: AI binding, Durable Object binding, migrations
├── package.json
├── tsconfig.json
├── AGENTS.md             # Cloudflare API context for AI coding tools
├── README.md             # this file
└── PROMPTS.md            # AI prompts used during development
```

---

## Tech stack

- **TypeScript** — strict mode, single-file Worker
- **Cloudflare Workers** — edge runtime
- **Cloudflare Agents SDK** (`agents` npm package) — handles WebSocket routing and Durable Object lifecycle
- **Durable Objects** with SQLite storage — per-user state
- **Workers AI** — Llama 3.3 70B inference
- **PDF.js** (loaded from CDN) — client-side PDF text extraction
- **Vanilla HTML/CSS/JS frontend** — no React, no build step, served inline from the Worker

---

## Future improvements

- Streaming responses (currently waits for the full LLM reply before sending)
- DOCX support in addition to PDF
- Vision-based PDF analysis using Llama 3.2 Vision for ATS layout critique
- Vectorize integration for semantic search over a knowledge base of company-specific interview prep
- Workflows for multi-step jobs like "research this company, generate 5 mock interview questions, then store them as flashcards"

---

## Author

Built by Shiven (Neo) Paudyal as part of the Cloudflare SWE Internship application.
