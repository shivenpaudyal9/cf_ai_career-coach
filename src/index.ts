import { Agent, AgentNamespace, routeAgentRequest } from "agents";

export interface Env {
  CAREER_COACH: AgentNamespace<CareerCoachAgent>;
  AI: Ai;
}

export class CareerCoachAgent extends Agent<Env> {
  async onMessage(connection: any, message: string) {
    let parsed: { text: string; userId: string };
    try {
      parsed = JSON.parse(message);
    } catch {
      connection.send(JSON.stringify({ error: "Invalid message format" }));
      return;
    }

    const { text } = parsed;

    this.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `;

    this.sql`
      INSERT INTO messages (role, content, created_at)
      VALUES ('user', ${text}, ${Date.now()})
    `;

    const history = [
      ...this.sql`
        SELECT role, content FROM messages
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ]
      .reverse()
      .map((row: any) => ({ role: row.role, content: row.content }));

    const response = await this.env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          {
            role: "system",
            content: `You are an expert AI career coach helping software engineers land great jobs. 
You help with resume reviews, mock interviews, job search strategy, salary negotiation, and career advice.
Be concise, specific, and encouraging.

IMPORTANT: You have persistent memory of past conversations with this user — the messages below are real history, not a roleplay. Reference details from earlier turns naturally. Never say "this is the beginning of our conversation" if there are previous messages.

When the user uploads a resume (you'll see a message starting with "[RESUME UPLOAD]"), provide a structured analysis:
1. **Overall impression** — 2-3 sentences on strengths
2. **Top 3 weaknesses** — be specific and actionable
3. **ATS optimization** — keyword density, formatting issues, missing sections
4. **Improved bullets** — rewrite the 3 weakest bullets using the XYZ formula
5. **Next steps** — concrete actions to take this week

Remember the resume content for follow-up questions about it.`,
          },
          ...history,
        ],
        stream: false,
      } as any
    );

    const reply =
      (response as any).response || "Sorry, I couldn't generate a response.";

    this.sql`
      INSERT INTO messages (role, content, created_at)
      VALUES ('assistant', ${reply}, ${Date.now()})
    `;

    connection.send(JSON.stringify({ role: "assistant", content: reply }));
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/agents/")) {
      const agentResponse = await routeAgentRequest(request, env, ctx);
      if (agentResponse) return agentResponse;
    }

    return new Response(getHTML(), {
      headers: { "Content-Type": "text/html" },
    });
  },
};

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>CF AI Career Coach</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    #app {
      width: 100%;
      max-width: 720px;
      height: 90vh;
      display: flex;
      flex-direction: column;
      background: #1a1d27;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    #header {
      padding: 20px 24px;
      background: #f6821f;
      color: white;
      font-size: 1.1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .message {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.6;
      font-size: 0.95rem;
    }
    .user {
      background: #f6821f;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .assistant {
      background: #2d3148;
      color: #e2e8f0;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .thinking {
      background: #2d3148;
      color: #888;
      align-self: flex-start;
      font-style: italic;
    }
    #input-area {
      padding: 16px 24px;
      background: #13151f;
      display: flex;
      gap: 10px;
    }
    #input {
      flex: 1;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid #2d3148;
      background: #1a1d27;
      color: #e2e8f0;
      font-size: 0.95rem;
      outline: none;
    }
    #input:focus { border-color: #f6821f; }
    #send {
      padding: 12px 20px;
      background: #f6821f;
      color: white;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
    }
    #send:hover { background: #e07010; }
    #send:disabled { background: #555; cursor: not-allowed; }
	#attach {
  padding: 12px 14px;
  background: #2d3148;
  color: #e2e8f0;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-size: 1.1rem;
}
#attach:hover { background: #3d4258; }
#attach:disabled { opacity: 0.5; cursor: not-allowed; }
.upload-status {
  background: #1e3a5f;
  color: #93c5fd;
  align-self: center;
  font-size: 0.85rem;
  font-style: italic;
}
  </style>
</head>
<body>
  <div id="app">
    <div id="header">🚀 CF AI Career Coach &nbsp;<span style="font-weight:300;font-size:0.85rem;">powered by Llama 3.3 on Workers AI</span></div>
    <div id="messages">
      <div class="message assistant">👋 Hi! I'm your AI career coach, powered by Cloudflare Workers AI. Ask me anything — resume reviews, mock interviews, salary negotiation, job search strategy, and more. Your conversation history is saved between sessions!</div>
    </div>
    <div id="input-area">
  <button id="attach" title="Upload resume PDF">📎</button>
  <input id="file-input" type="file" accept=".pdf" style="display:none" />
  <input id="input" type="text" placeholder="Ask your career question..." />
  <button id="send">Send</button>
</div>

  <script>
    let userId = localStorage.getItem('cf-ai-coach-userId');
	if (!userId) {
  		userId = 'user-' + Math.random().toString(36).slice(2, 9);
  		localStorage.setItem('cf-ai-coach-userId', userId);
	}
    const agentName = 'career-coach-' + userId;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + location.host + '/agents/career-coach-agent/' + agentName;

    let ws = new WebSocket(wsUrl);
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const send = document.getElementById('send');

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = content;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return div;
    }

    ws.onopen = () => console.log('WebSocket connected');
    
    ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const thinking = document.querySelector('.thinking');
  if (thinking) thinking.remove();
  if (data.content) addMessage('assistant', data.content);
  send.disabled = false;
  attachBtn.disabled = false;
  input.focus();
};

    ws.onerror = (e) => {
      console.error('WS error', e);
      addMessage('assistant', '⚠️ Connection error. Please refresh.');
    };

    function sendMessage() {
      const text = input.value.trim();
      if (!text || ws.readyState !== WebSocket.OPEN) return;
      addMessage('user', text);
      addMessage('thinking', '...');
      ws.send(JSON.stringify({ text, userId }));
      input.value = '';
      send.disabled = true;
    }

    send.onclick = sendMessage;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });// PDF upload + parsing
const attachBtn = document.getElementById('attach');
const fileInput = document.getElementById('file-input');

attachBtn.onclick = () => fileInput.click();

fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    addMessage('assistant', '⚠️ File too large. Please upload a PDF under 5MB.');
    return;
  }

  // Show status
  const statusDiv = document.createElement('div');
  statusDiv.className = 'message upload-status';
  statusDiv.textContent = '📎 Reading ' + file.name + '...';
  messages.appendChild(statusDiv);
  messages.scrollTop = messages.scrollHeight;
  attachBtn.disabled = true;
  send.disabled = true;

  try {
    // Load PDF.js dynamically
    const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + String.fromCharCode(10) + String.fromCharCode(10);
    }

    if (fullText.trim().length < 50) {
      statusDiv.textContent = '⚠️ Could not extract text. Is this a scanned PDF?';
      attachBtn.disabled = false;
      send.disabled = false;
      return;
    }

    statusDiv.textContent = '✅ Resume uploaded (' + pdf.numPages + ' page' + (pdf.numPages > 1 ? 's' : '') + ', ' + fullText.length + ' chars). Analyzing...';

    // Send to agent
    const resumeMessage = '[RESUME UPLOAD] Please analyze this resume:' + String.fromCharCode(10) + String.fromCharCode(10) + fullText;
    addMessage('thinking', '...');
    ws.send(JSON.stringify({ text: resumeMessage, userId }));

  } catch (err) {
    console.error('PDF parse error:', err);
    statusDiv.textContent = '⚠️ Failed to read PDF: ' + err.message;
    attachBtn.disabled = false;
    send.disabled = false;
  }

  fileInput.value = '';
};
	
  </script>
</body>
</html>`;
}