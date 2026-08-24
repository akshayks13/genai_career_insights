import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createRequire } from 'module';
import insightsRoutes from './src/routes/insightsRoutes.js';
import jobsRoutes from './src/routes/jobsRoutes.js';
import prepRoutes from './src/routes/prepRoutes.js';
import { agents as srcAgents } from './src/agents/agent.js';
import { InMemoryRunner } from '@google/adk';

function loadAdkAgents() {
  const require = createRequire(import.meta.url);
  const baseDir = path.resolve(process.cwd(), 'adk_agents');
  const agentDirs = [
    'careerPlanningAgent',
    'skillGapRoadmapAgent',
    'ragIntelligenceAgent',
    'feedbackAdaptationAgent',
    'jobSearchApplicationAgent',
    'resumeOptimizationAgent',
    'jobPrepAgent'
  ];

  const loaded = {};
  for (const dirName of agentDirs) {
    // Each adk_agents/<name>/agent.js exports { rootAgent }
    const mod = require(path.join(baseDir, dirName, 'agent.js'));
    if (!mod?.rootAgent) {
      throw new Error(`adk_agents/${dirName}/agent.js must export rootAgent`);
    }
    loaded[dirName] = mod.rootAgent;
  }
  return loaded;
}

const agents = (process.env.AGENTS_SOURCE || '').toLowerCase() === 'adk_agents'
  ? loadAdkAgents()
  : srcAgents;

console.log(`Agents source: ${(process.env.AGENTS_SOURCE || '').toLowerCase() === 'adk_agents' ? 'adk_agents (CommonJS)' : 'src/agents (ESM)'}`);

// Basic env validation & helpful warnings
const baseRequired = ['NEWS_API_KEY','PROJECT_ID'];
const baseMissing = baseRequired.filter(k => !process.env[k]);
if (baseMissing.length) {
  console.warn('Missing required env vars:', baseMissing.join(', '));
}

// Auth strategy detection
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.log('Auth: service account key file mode');
  console.log('   File:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
} else {
  console.log('Auth: Application Default Credentials (gcloud login)');
  console.log('Ensure you ran: gcloud auth application-default login');
}

const app = express();
const PORT = process.env.PORT || 3000;

const allowAll = (process.env.CORS_ORIGINS || '*') === '*';
const whitelist = allowAll
  ? []
  : process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

const corsOptions = {
  origin: allowAll
    ? true
    : function (origin, callback) {
        if (!origin || whitelist.includes(origin)) return callback(null, true);
        return callback(new Error('CORS: Origin not allowed'));
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Serve static files

// Routes
app.use('/api', insightsRoutes);
app.use('/api', prepRoutes);
app.use('/api/jobs', jobsRoutes);

// Agent endpoint
const activeRunners = new Map(); // Store runners by sessionId
// Cap the number of cached runners to avoid unbounded memory growth. Oldest
// sessions are evicted first (Map preserves insertion order).
const MAX_ACTIVE_RUNNERS = Number(process.env.MAX_ACTIVE_RUNNERS) || 500;
const DEBUG_AGENT = process.env.DEBUG_AGENT === '1';

function extractToolResponsesFromEvent(event) {
  const out = [];
  const parts = event?.content?.parts;
  if (!Array.isArray(parts)) return out;

  for (const part of parts) {
    // Common ADK / GenAI shape: { functionResponse: { name, response } }
    if (part?.functionResponse?.name) {
      out.push({ name: part.functionResponse.name, response: part.functionResponse.response });
      continue;
    }

    // Best-effort fallback: if a tool emitted text, try to parse JSON from it.
    if (typeof part?.text === 'string' && part.text.trim()) {
      const parsed = tryParseEmbeddedJson(part.text);
      if (parsed && typeof parsed === 'object') {
        out.push({ name: 'unknown', response: parsed });
      }
    }
  }

  return out;
}

function tryParseEmbeddedJson(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return null;

  // 1) Strip common ```json fences
  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // 2) If the whole thing is valid JSON, parse it.
  try {
    return JSON.parse(unfenced);
  } catch {
    // fall through
  }

  // 3) Find the first balanced JSON object/array within surrounding text.
  const start = unfenced.search(/[\[{]/);
  if (start < 0) return null;

  const open = unfenced[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === open) depth++;
    if (ch === close) depth--;

    if (depth === 0) {
      const candidate = unfenced.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }

  return null;
}

function buildCareerPlanJsonPrompt(inputObj) {
  const {
    role,
    skills,
    experience,
    interests,
    ...rest
  } = inputObj || {};

  const lines = [];
  if (role) lines.push(`Role: ${role}`);
  if (skills) lines.push(`Skills: ${skills}`);
  // keep interests optional but present if provided
  if (typeof interests === 'string' && interests.trim()) {
    lines.push(`Interests: ${interests.trim()}`);
  }
  if (experience !== undefined) {
    lines.push(`Experience (JSON): ${JSON.stringify(experience)}`);
  }

  const restKeys = Object.keys(rest || {});
  if (restKeys.length) {
    lines.push(`Additional context (JSON): ${JSON.stringify(rest)}`);
  }

  // If user sends an empty object, still stringify it rather than sending empty text.
  return lines.length ? lines.join('\n') : JSON.stringify(inputObj);
}

app.post('/api/agent/:name', async (req, res) => {
  const { name } = req.params;
  const { prompt, sessionId: providedSessionId } = req.body;

  const rawPrompt = prompt;
  let promptText = null;

  if (typeof rawPrompt === 'string') {
    promptText = rawPrompt.trim();
  } else if (rawPrompt && typeof rawPrompt === 'object') {
    // Only this agent supports structured prompt objects.
    if (name === 'careerPlanJsonAgent') {
      promptText = buildCareerPlanJsonPrompt(rawPrompt);
    } else {
      return res.status(400).json({
        success: false,
        error: `Agent '${name}' expects prompt to be a string. Structured prompt objects are only supported for 'careerPlanJsonAgent'.`
      });
    }
  }

  if (!promptText) {
    return res.status(400).json({
      success: false,
      error: 'Missing prompt. Send { prompt: "..." }.'
    });
  }

  const agent = agents[name];
  if (!agent) {
    return res.status(404).json({ error: `Agent '${name}' not found. Available agents: ${Object.keys(agents).join(', ')}` });
  }

  try {
    const userId = 'user-1';
    const sessionId = providedSessionId || `session-${Date.now()}`;
    
    let runner;
    if (activeRunners.has(sessionId)) {
      runner = activeRunners.get(sessionId);
    } else {
      while (activeRunners.size >= MAX_ACTIVE_RUNNERS) {
        const oldestKey = activeRunners.keys().next().value;
        if (oldestKey === undefined) break;
        activeRunners.delete(oldestKey);
      }

      runner = new InMemoryRunner({ agent });
      activeRunners.set(sessionId, runner);

      await runner.sessionService.createSession({
        appName: runner.appName,
        userId,
        sessionId
      });
    }

    const iterator = runner.runAsync({
      userId,
      sessionId,
      newMessage: { role: 'user', parts: [{ text: promptText }] }
    });

    let finalResponse = '';
    const toolResponses = new Map();
    for await (const event of iterator) {
      if (DEBUG_AGENT) console.log('Agent Event:', JSON.stringify(event, null, 2));

      // Capture tool responses for strict-JSON agents
      const extracted = extractToolResponsesFromEvent(event);
      for (const tr of extracted) {
        if (!tr?.name) continue;
        toolResponses.set(tr.name, tr.response);
      }
      
      if (event.content && event.content.role === 'model') {
        const textParts = (event.content.parts?.map(p => p.text || '') || []).join('');
        finalResponse += textParts;
      }
    }

    if (name === 'resumeOptimizationAgent' && toolResponses.has('optimizeResume')) {
      return res.json({ success: true, result: toolResponses.get('optimizeResume'), sessionId });
    }

    const parsedJson = tryParseEmbeddedJson(finalResponse);
    return res.json({ success: true, result: parsedJson ?? finalResponse, sessionId });
  } catch (error) {
    console.error(`Agent '${name}' error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'career-insights-api'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Career Insights API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      setup: '/api/setup',
      ingestNews: 'POST /api/ingest/news',
      insights: 'GET /api/insights?skills=python,js&role=engineer',
      jobs: {
        ingest: 'POST /api/jobs/ingest { query, page }',
        talent: {
          createCompany: 'POST /api/jobs/talent/company { displayName, externalId? }',
          createJob: 'POST /api/jobs/talent/job { title, company_name, description, apply_link, location, employment_type, job_id }',
          search: 'GET /api/jobs/talent/search?q=frontend+developer&location=Bangalore'
        }
      },
      agents: {
        run: 'POST /api/agent/:name { prompt, sessionId? }',
        available: Object.keys(agents)
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
