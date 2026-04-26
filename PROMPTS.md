# AI Prompts Used During Development

This project was built with AI coding assistance from Claude (Anthropic). Below is a curated log of the actual prompts used during the build, in roughly chronological order.

---

## Initial planning

> "applying for cloudflare swe internship, this is in the application form — Optional Assignment: build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components: LLM (recommend using Llama 3.3 on Workers AI), Workflow / coordination (recommend using Workflows, Workers or Durable Objects), User input via chat or voice (recommend using Pages or Realtime), Memory or state. Help me with this please."

This kicked off the project. The assistant proposed a career coaching chatbot since it cleanly maps all four required components and is genuinely useful given my background. Repo name agreed: `cf_ai_career-coach`.

---

## Step-by-step build

> "Provide step by step guide on how to make it, one step at a time"

This drove the entire build process — Wrangler install, account login, project scaffolding, dependency install, and writing the Worker code one piece at a time, with verification after each step.

---

## Project setup

Used `create-cloudflare@latest` with these choices:

- Hello World example
- Worker only
- TypeScript
- Yes to git
- Yes to AGENTS.md
- No to deploy (deferred until the code was ready)

Then installed the Cloudflare Agents SDK:

```bash
npm install agents
```

---

## Initial Worker code

The first version of `src/index.ts` was generated based on this internal plan:

> Build a single-file Worker that:
> - Defines a `CareerCoachAgent` extending `Agent<Env>` from the `agents` package
> - Uses `this.sql` (Durable Object SQLite) to store and retrieve conversation history
> - Calls `@cf/meta/llama-3.3-70b-instruct-fp8-fast` on Workers AI with the last 10 (later 20) messages as context
> - Serves an inline HTML chat UI from the same Worker
> - Routes WebSocket connections via the Agents SDK's `routeAgentRequest`

The `wrangler.jsonc` was configured with:
- AI binding named `AI`
- A Durable Object binding for `CareerCoachAgent`
- A SQLite migration tag

---

## Debugging the WebSocket routing

The first run failed with:

```
The url http://127.0.0.1:8787/agent/CareerCoachAgent/career-coach-user-xxx
with namespace "CareerCoachAgent" and name "career-coach-user-xxx"
does not match any server namespace.
```

I inspected the `agents` package internals directly using Node:

```bash
node -e "const fs=require('fs');const c=fs.readFileSync('node_modules/agents/dist/index.js','utf8');const i=c.indexOf('function routeAgentRequest');console.log(c.slice(i,i+1500));"
```

This revealed three real issues:

1. The default URL prefix is `/agents/` (plural), not `/agent/`.
2. The SDK kebab-cases class names in URLs — `CareerCoachAgent` becomes `career-coach-agent`.
3. The Durable Object binding `name` in `wrangler.jsonc` must match the class name exactly (`CareerCoachAgent`), not a SCREAMING_SNAKE_CASE alias.

Fixes applied:

```typescript
// before
const wsUrl = '/agent/CareerCoachAgent/' + agentName;
// after
const wsUrl = '/agents/career-coach-agent/' + agentName;
```

```jsonc
// before
"name": "CAREER_COACH",
// after
"name": "CareerCoachAgent",
```

The Worker's fetch handler also had to pass `ctx` directly to `routeAgentRequest` so the SDK could look up the class via `ctx.exports`.

---

## Testing memory

> "What should I ask to check its functionality?"

The assistant suggested testing in three layers:
1. LLM functionality — generate a resume bullet
2. Same-session memory — ask it to revise the previous bullet
3. Cross-session memory — refresh the page and ask what it remembers

The first two passed immediately. Cross-session memory needed a fix.

---

## Cross-session persistent memory

> "We fixed the persistent memory thing, even after refreshing it has data saved."

The original frontend generated a new random `userId` on every page load, so each refresh created a brand new Durable Object with no history. Fix:

```javascript
// before
const userId = 'user-' + Math.random().toString(36).slice(2, 9);

// after
let userId = localStorage.getItem('cf-ai-coach-userId');
if (!userId) {
  userId = 'user-' + Math.random().toString(36).slice(2, 9);
  localStorage.setItem('cf-ai-coach-userId', userId);
}
```

Combined with the Durable Object's SQLite-backed message history, the agent now correctly recalls user details across page refreshes, browser restarts, and even redeployments.

---

## System prompt refinement

After confirming memory worked, the LLM was occasionally saying "this is the beginning of our conversation" even when history existed. The system prompt was updated:

```
IMPORTANT: You have persistent memory of past conversations with this user —
the messages below are real history, not a roleplay. Reference details from
earlier turns naturally. Never say "this is the beginning of our conversation"
if there are previous messages.
```

Also bumped the history window from 10 messages to 20 for richer context.

---

## Initial deployment

> "yes, it works!"

After verifying locally, deployed with:

```bash
npm run deploy
```

Got back: `https://cf-ai-career-coach.shiven19p.workers.dev`

---

## Adding resume upload

> "can we add attaching docs to read resume and analyse it and give recommendations"

Discussed two approaches:
- **Option A: Text-only** — extract PDF text in the browser with PDF.js, send text to LLM
- **Option B: Vision-based** — convert PDF to images, use a vision model

Picked Option A for the demo since it's clean, fast, and doesn't require a vision model.

The implementation added:
1. A 📎 attach button next to the text input
2. PDF.js loaded from CDN for client-side text extraction
3. A 5MB file size cap and a check for empty/scanned PDFs
4. A `[RESUME UPLOAD]` prefix on the message to the agent so the system prompt could trigger structured analysis
5. An expanded system prompt with specific structure for resume feedback (overall impression, top 3 weaknesses, ATS optimization, rewritten bullets, next steps)

### Debugging template literal collisions

Embedding JavaScript inside a TypeScript template literal (the inline HTML returned by `getHTML()`) caused several escape-sequence bugs:

- Backticks in the inner JS conflicted with the outer template literal
- `\n\n` inside JS strings got pre-evaluated by TypeScript and broke the rendered HTML
- Solution: replaced all problematic strings with explicit `String.fromCharCode(10)` calls and string concatenation instead of template literals

The diagnostic that pinpointed the issue was running curl + Node to dump the actual rendered HTML and inspect the broken lines:

```bash
curl http://localhost:8787 -o rendered.html
node -e "const fs=require('fs');const lines=fs.readFileSync('rendered.html','utf8').split(/\r?\n/);for(let i=215;i<240;i++)console.log((i+1)+': '+lines[i]);"
```

---

## Final verification and redeployment

After resume upload was working locally:

> "yes , it works!" (after testing with an actual PDF resume — 4491 characters extracted, structured analysis returned)

Redeployed to push the resume feature live:

```bash
npm run deploy
```

---

## Documentation

> "What are you gonna add in the github repo?" / "add that we fixed the persistent memory thing"

The assistant generated this `PROMPTS.md`, the `README.md` (which highlights persistent memory and resume upload prominently), and a `.gitignore`.

---

## Tools used

- **Claude (Anthropic)** for architectural planning, code generation, and debugging the Agents SDK routing + template literal escaping issues
- **Cloudflare Wrangler CLI** for project scaffolding, dev server, and deployment
- **`create-cloudflare`** for the initial template
- **PDF.js** (Mozilla) loaded from CDN for client-side resume parsing
- **VS Code** as the editor

All code was reviewed and tested before committing. AI was used as a pair programmer, not a black box — every error message was investigated, every fix was understood and applied deliberately.
