/* ========================================
   AppForge AI - Main Application Logic
   Lunor Internship Round 1
   ======================================== */

// ---- STATE ----
let GROQ_KEY = localStorage.getItem('appforge_groq_key') || '';
let currentIdea = '';
let activeCodeTab = 'backend';
let quizAnswered = {};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  updateApiStatus();
});

function updateApiStatus() {
  const dot = document.getElementById('apiDot');
  const status = document.getElementById('apiStatus');
  if (GROQ_KEY) {
    dot.className = 'dot connected';
    status.textContent = 'Groq connected';
  } else {
    dot.className = 'dot';
    status.textContent = 'No key set';
  }
}

// ---- MODAL ----
function openModal() {
  document.getElementById('apiModal').classList.add('open');
  document.getElementById('apiKeyInput').value = GROQ_KEY;
}

function closeModal() {
  document.getElementById('apiModal').classList.remove('open');
}

function saveKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  GROQ_KEY = key;
  localStorage.setItem('appforge_groq_key', key);
  updateApiStatus();
  closeModal();
  showToast('API key saved!');
}

// ---- EXAMPLES ----
function fillExample(text) {
  document.getElementById('ideaInput').value = text;
  document.getElementById('ideaInput').focus();
}

// ---- TABS ----
function switchTab(tab) {
  document.querySelectorAll('.stage-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.stage-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.add('active');
}

function switchCodeTab(el, tab) {
  document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.code-block').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`code-${tab}`).classList.add('active');
  activeCodeTab = tab;
  const filenames = {
    backend: 'server.js',
    frontend: 'App.jsx',
    database: 'schema.sql'
  };
  document.getElementById('codeFilename').textContent = filenames[tab];
}

// ---- COPY ----
function copyContent(id) {
  const el = document.getElementById(id);
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!');
  });
}

function copyActiveCode() {
  const el = document.getElementById(`code-${activeCodeTab}`);
  navigator.clipboard.writeText(el.textContent).then(() => {
    showToast('Code copied!');
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #22c55e;
    color: #fff;
    font-size: 13px;
    font-family: var(--sans);
    padding: 8px 18px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

// ---- PIPELINE HIGHLIGHT ----
function highlightPipeStep(n) {
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById(`ps${i}`);
    if (el) el.classList.toggle('active', i === n);
  }
}

// ---- TAB STATUS ----
function setTabLoading(stage) {
  const tab = document.querySelector(`[data-tab="${stage}"]`);
  const dot = document.getElementById(`dot-${stage}`);
  if (tab) tab.classList.add('loading');
  if (dot) dot.className = 'tab-dot';
}

function setTabDone(stage) {
  const tab = document.querySelector(`[data-tab="${stage}"]`);
  if (tab) {
    tab.classList.remove('loading');
    tab.classList.add('done');
  }
}

// ---- RESET ----
function resetOutputs() {
  document.getElementById('understandContent').innerHTML = '<span class="cursor"></span>';
  document.getElementById('planContent').innerHTML = '<div class="stage-content"><span class="cursor"></span></div>';
  document.getElementById('code-backend').textContent = '// Generating...';
  document.getElementById('code-frontend').textContent = '// Generating...';
  document.getElementById('code-database').textContent = '-- Generating...';
  document.getElementById('explainContent').innerHTML = '<div class="explain-body"><span class="cursor"></span></div>';
  document.getElementById('learnBody').innerHTML = '<span class="cursor"></span>';

  quizAnswered = {};

  ['understand', 'plan', 'build', 'explain', 'learn'].forEach(s => {
    const tab = document.querySelector(`[data-tab="${s}"]`);
    if (tab) tab.classList.remove('done', 'loading');
  });
}

// ---- MAIN GENERATION ----
async function startGeneration() {
  const idea = document.getElementById('ideaInput').value.trim();

  if (!idea) {
    document.getElementById('ideaInput').focus();
    document.getElementById('ideaInput').style.borderColor = '#ef4444';
    setTimeout(() => {
      document.getElementById('ideaInput').style.borderColor = '';
    }, 1500);
    return;
  }

  if (!GROQ_KEY) {
    openModal();
    return;
  }

  currentIdea = idea;

  const btn = document.getElementById('generateBtn');
  const spinner = document.getElementById('spinner');
  const btnText = document.getElementById('generateBtnText');

  btn.disabled = true;
  spinner.style.display = 'block';
  btnText.textContent = 'Generating...';

  document.getElementById('outputPanels').classList.add('visible');
  switchTab('understand');
  resetOutputs();
  highlightPipeStep(1);

  try {
    await runStage1_Understand(idea);
    highlightPipeStep(2);
    await runStage2_Plan(idea);
    highlightPipeStep(3);
    await runStage3_Build(idea);
    highlightPipeStep(4);
    await runStage4_Explain(idea);
    highlightPipeStep(5);
    await runStage5_Learn(idea);
    showToast('All stages complete!');
  } catch (err) {
    console.error(err);
    showToast('Error: ' + (err.message || 'Check your API key'));
  } finally {
    btn.disabled = false;
    spinner.style.display = 'none';
    btnText.textContent = '⚡ Regenerate';
  }
}

// ---- GROQ STREAMING ----
async function groqStream(prompt, onChunk) {
  // Use proxy server so API key stays secret
  // If user has their own key, call Groq directly
  const useProxy = !GROQ_KEY;
  const url = useProxy
    ? '/api/groq'
    : 'https://api.groq.com/openai/v1/chat/completions';

  const headers = { 'Content-Type': 'application/json' };
  if (!useProxy) headers['Authorization'] = `Bearer ${GROQ_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 1200,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Groq API error');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          onChunk(delta, fullText);
        }
      } catch (_) {
        // skip malformed chunks
      }
    }
  }

  return fullText;
}

// ---- STAGE 1: UNDERSTAND ----
async function runStage1_Understand(idea) {
  setTabLoading('understand');
  const el = document.getElementById('understandContent');
  el.innerHTML = '';

  const prompt = `You are an expert product analyst. Analyze this app idea clearly and concisely.

App idea: "${idea}"

Respond using exactly these headers:

**CORE PROBLEM**
What problem does this app solve? (2-3 sentences)

**TARGET USERS**
Who will use this app and why? (2-3 sentences)

**KEY FEATURES**
List 5 must-have features, one per line starting with a dash

**UNIQUE VALUE**
What makes this app worth building? (2 sentences)

**TECHNICAL COMPLEXITY**
Rate: Beginner / Intermediate / Advanced - explain why in 1-2 sentences

Keep it practical and honest.`;

  let buffer = '';
  await groqStream(prompt, (delta, full) => {
    buffer = full;
    el.innerHTML = formatMarkdown(buffer) + '<span class="cursor"></span>';
  });

  el.innerHTML = formatMarkdown(buffer);
  setTabDone('understand');
}

// ---- STAGE 2: PLAN ----
async function runStage2_Plan(idea) {
  setTabLoading('plan');
  switchTab('plan');

  const el = document.getElementById('planContent');
  el.innerHTML = '<div class="stage-content"></div>';
  const inner = el.querySelector('.stage-content');

  const prompt = `You are a senior software architect. Create a technical plan for this app.

App idea: "${idea}"

Respond using exactly these headers:

**TECH STACK**
Frontend: [choice and reason]
Backend: [choice and reason]
Database: [choice and reason]
Auth: [choice]
Hosting: [choice]

**DATABASE SCHEMA**
List the main tables and their key fields:
- users: id, name, email, password_hash, created_at
- [add more]

**API ENDPOINTS**
List 6 key REST endpoints:
- GET /api/... - description
- [add more]

**DEVELOPMENT PHASES**
Phase 1 (Week 1-2): what to build
Phase 2 (Week 3-4): what to build
Phase 3 (Week 5-6): what to build

Be specific and concise.`;

  let buffer = '';
  await groqStream(prompt, (delta, full) => {
    buffer = full;
    inner.innerHTML = formatMarkdown(buffer) + '<span class="cursor"></span>';
  });

  inner.innerHTML = formatMarkdown(buffer);
  setTabDone('plan');
}

// ---- STAGE 3: BUILD ----
async function runStage3_Build(idea) {
  setTabLoading('build');
  switchTab('build');

  const backendPrompt = `Write clean Node.js/Express backend starter code for this app: "${idea}"

Include:
- Express app setup with CORS and JSON middleware
- 3-4 realistic API routes with proper handlers
- Simple JWT auth middleware
- Error handling middleware
- Helpful comments

Write only the code. Max 55 lines. Use modern JS (const, arrow functions, async/await).`;

  const frontendPrompt = `Write a clean React component for this app: "${idea}"

Include:
- Functional component with useState and useEffect
- A fetch call to the backend API
- Basic JSX layout that matches the app concept
- Loading and error states
- Comments explaining key parts

Write only the code. Max 55 lines. Use modern React patterns.`;

  const dbPrompt = `Write a PostgreSQL database schema for this app: "${idea}"

Include:
- 3-4 CREATE TABLE statements with proper data types
- Primary keys, foreign keys, and useful indexes
- Constraints (NOT NULL, UNIQUE where appropriate)
- A few INSERT sample rows
- Comments explaining each table

Write only SQL. Max 45 lines.`;

  // Run all three in parallel for speed
  await Promise.all([
    groqStream(backendPrompt, (delta, full) => {
      document.getElementById('code-backend').textContent = full;
    }),
    groqStream(frontendPrompt, (delta, full) => {
      document.getElementById('code-frontend').textContent = full;
    }),
    groqStream(dbPrompt, (delta, full) => {
      document.getElementById('code-database').textContent = full;
    })
  ]);

  setTabDone('build');
}

// ---- STAGE 4: EXPLAIN ----
async function runStage4_Explain(idea) {
  setTabLoading('explain');
  switchTab('explain');

  const el = document.getElementById('explainContent');
  el.innerHTML = '<div class="explain-body"></div>';
  const inner = el.querySelector('.explain-body');

  const prompt = `You are a senior developer mentoring a junior. Explain the architectural decisions for this app.

App: "${idea}"

Cover these topics clearly:

**WHY THIS TECH STACK**
Explain why Node.js + React + PostgreSQL makes sense here. What are the real tradeoffs?

**DATABASE DESIGN DECISIONS**
Why relational vs NoSQL? What were the key schema decisions?

**SCALABILITY CONSIDERATIONS**
What breaks first when the app gets popular? How do you fix it?

**SECURITY CHECKLIST**
List 5 critical security things the developer must implement

**COMMON MISTAKES TO AVOID**
List 3 mistakes junior developers make when building this type of app

Write in a direct, mentor-to-student tone. Be honest.`;

  let buffer = '';
  await groqStream(prompt, (delta, full) => {
    buffer = full;
    inner.innerHTML = formatMarkdown(buffer) + '<span class="cursor"></span>';
  });

  inner.innerHTML = formatMarkdown(buffer);
  setTabDone('explain');
}

// ---- STAGE 5: LEARN ----
async function runStage5_Learn(idea) {
  setTabLoading('learn');
  switchTab('learn');

  const el = document.getElementById('learnBody');
  el.innerHTML = '';

  const prompt = `Create a learning roadmap for someone building: "${idea}"

Return ONLY valid JSON, no extra text, no markdown fences:
{
  "concepts": [
    {"title": "name", "desc": "one line why it matters", "type": "concept"},
    {"title": "name", "desc": "one line why it matters", "type": "concept"}
  ],
  "tutorials": [
    {"title": "name", "desc": "what you learn", "type": "tutorial"},
    {"title": "name", "desc": "what you learn", "type": "tutorial"}
  ],
  "tools": [
    {"title": "name", "desc": "what it does", "type": "tool"},
    {"title": "name", "desc": "what it does", "type": "tool"}
  ],
  "quiz": [
    {
      "q": "question text",
      "options": ["A", "B", "C", "D"],
      "answer": 0
    },
    {
      "q": "question text",
      "options": ["A", "B", "C", "D"],
      "answer": 1
    },
    {
      "q": "question text",
      "options": ["A", "B", "C", "D"],
      "answer": 2
    }
  ]
}`;

  const full = await groqStream(prompt, () => {});

  try {
    const jsonMatch = full.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const data = JSON.parse(jsonMatch[0]);
    renderLearnPanel(data, el);
    setTabDone('learn');
  } catch (err) {
    // Fallback: render as plain text if JSON fails
    el.innerHTML = `<div class="explain-body">${formatMarkdown(full)}</div>`;
    setTabDone('learn');
  }
}

// ---- RENDER LEARN PANEL ----
function renderLearnPanel(data, el) {
  let html = '';

  if (data.concepts?.length) {
    html += `<div class="h-section">Key concepts to learn</div>`;
    html += `<div class="learn-grid">`;
    data.concepts.forEach(c => {
      html += `<div class="resource-card">
        <span class="resource-card-type ${c.type}">${c.type}</span>
        <h4>${c.title}</h4>
        <p>${c.desc}</p>
      </div>`;
    });
    html += `</div>`;
  }

  if (data.tutorials?.length) {
    html += `<div class="h-section">Tutorials to follow</div>`;
    html += `<div class="learn-grid">`;
    data.tutorials.forEach(t => {
      html += `<div class="resource-card">
        <span class="resource-card-type ${t.type}">${t.type}</span>
        <h4>${t.title}</h4>
        <p>${t.desc}</p>
      </div>`;
    });
    html += `</div>`;
  }

  if (data.tools?.length) {
    html += `<div class="h-section">Tools to use</div>`;
    html += `<div class="learn-grid">`;
    data.tools.forEach(t => {
      html += `<div class="resource-card">
        <span class="resource-card-type ${t.type}">${t.type}</span>
        <h4>${t.title}</h4>
        <p>${t.desc}</p>
      </div>`;
    });
    html += `</div>`;
  }

  if (data.quiz?.length) {
    html += `<div class="h-section">Quick knowledge check</div>`;
    html += `<div class="quiz-area">`;
    data.quiz.forEach((q, i) => {
      html += `<div class="quiz-q" id="quiz-q-${i}">
        <div class="quiz-q-text">${i + 1}. ${q.q}</div>
        <div class="quiz-options">`;
      q.options.forEach((opt, j) => {
        html += `<button class="quiz-opt" onclick="answerQuiz(${i}, ${j}, ${q.answer})">${opt}</button>`;
      });
      html += `</div></div>`;
    });
    html += `</div>`;
  }

  el.innerHTML = html;
}

// ---- QUIZ ANSWER ----
function answerQuiz(qi, chosen, correct) {
  if (quizAnswered[qi]) return;
  quizAnswered[qi] = true;

  const opts = document.querySelectorAll(`#quiz-q-${qi} .quiz-opt`);
  opts.forEach((opt, i) => {
    if (i === correct) opt.classList.add('correct');
    else if (i === chosen && chosen !== correct) opt.classList.add('wrong');
    opt.style.pointerEvents = 'none';
  });
}

// ---- MARKDOWN FORMATTER ----
function formatMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text);font-weight:600">$1</strong>')
    .replace(/^- (.+)$/gm, '<span style="display:block;padding:2px 0 2px 16px;position:relative"><span style="position:absolute;left:0;color:var(--indigo-light)">&#8226;</span>$1</span>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}
