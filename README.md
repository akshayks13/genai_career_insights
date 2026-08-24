# Career Insights API

A modular Express.js application that fetches news articles, stores them in Google Cloud BigQuery, and generates AI-powered career insights using Google Vertex AI (Gemini).

## 🚀 Quick Start

```bash
# 1) Install
npm install

# 2) Configure environment
cp .env.example .env   # then edit values

# 3) Authenticate to Google Cloud (one of)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# or
gcloud auth application-default login

# 4) Run
npm run dev   # dev (nodemon)
# or
npm start     # prod
```

## 🤖 Agentic Mode (Google ADK)

This repo includes multiple Google ADK agents exposed via the API route `POST /api/agent/:name`.

Agent names (use these in the URL):
- `careerPlanningAgent`
- `careerPlanJsonAgent`
- `skillGapRoadmapAgent`
- `ragIntelligenceAgent`
- `feedbackAdaptationAgent`
- `jobsMatchAgent`
- `jobSearchApplicationAgent`

Request body:
- `prompt` (string, required)
- `sessionId` (string, optional) — reuse the same `sessionId` across calls to keep chat/session continuity.

### Call Agents via API (copy/paste)

Career Planning Agent:
```bash
curl -sS http://localhost:3000/api/agent/careerPlanningAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I am a software engineering student. Suggest the best career path for me and a 12-month plan."
  }'
```

Career Plan JSON Agent:
```bash
curl -sS http://localhost:3000/api/agent/careerPlanJsonAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I have 6 months frontend experience (HTML/CSS/JS/React). I want to become a Full Stack Developer. Give me a plan."
  }'
```

Response (example shape):
```json
{"careerPlanName":"...","description":"...","duration":"...","keyFocusAreas":["..."],"topSkillsToBuild":["..."],"milestones":[{"title":"...","timeframe":"...","outcome":"..."}],"quickWins":["..."]}
```

Skill Gap & Roadmap Agent:
```bash
curl -sS http://localhost:3000/api/agent/skillGapRoadmapAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Target role: Backend Engineer. Current skills: Python, SQL, basic Docker. Identify gaps and produce a structured roadmap."
  }'
```

RAG Intelligence Agent:
```bash
curl -sS http://localhost:3000/api/agent/ragIntelligenceAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarize current market demand for Data Engineers and list top skills and certifications to prioritize."
  }'
```

Feedback & Adaptation Agent:
```bash
curl -sS http://localhost:3000/api/agent/feedbackAdaptationAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Here is my current plan: (1) Learn DSA 2 weeks, (2) Build 1 project, (3) Apply to jobs. Critique and improve it with concrete milestones."
  }'
```

Job Search & Application Agent:
```bash
curl -sS http://localhost:3000/api/agent/jobSearchApplicationAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Find roles that fit: Software Engineer Intern. Location: India. Skills: Python, React. Suggest search keywords and an application strategy."
  }'
```

Jobs Match Agent (strict JSON, BigQuery-backed; mirrors `POST /api/jobs/match`):
```bash
curl -sS http://localhost:3000/api/agent/jobsMatchAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "query=devops engineer in india; location=Bengaluru; limit=10"
  }' | jq
```

Resume Optimization Agent:
```bash
curl -sS http://localhost:3000/api/agent/resumeOptimizationAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Optimize my resume for a Senior DevOps role. Resume: [PASTE RESUME TEXT HERE]"
  }'
```

Job Prep Agent (Jobs & Startups):
```bash
curl -sS http://localhost:3000/api/agent/jobPrepAgent \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I want to start an AI SaaS startup. I have 3 years of ML experience. Help me prepare."
  }'
```

### Session continuity (chat-style)

1) Make a first call and capture `sessionId` from the JSON response.

2) Reuse that `sessionId` on later calls:
```bash
curl -sS http://localhost:3000/api/agent/careerPlanningAgent \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-REPLACE_ME",
    "prompt": "Update the plan to focus more on system design and internships."
  }'
```

### ADK Web UI (interactive)

Run the ADK devtools web UI from the repo root:
```bash
npx adk web adk_agents
```

Then open the URL shown in the terminal output (it will typically be something like `http://localhost:8000`).

## 📡 Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | API info |
| GET | `/health` | Health check |
| GET | `/api/status` | System status (BigQuery, NewsAPI, Vertex AI) |
| POST | `/api/setup` | Initialize BigQuery dataset/table |
| POST | `/api/ingest/news` | Fetch + store news articles |
| POST | `/api/test/news` | Test news fetch (no storage) |
| GET | `/api/trends` | Trending topics from stored news |
| GET | `/api/insights` | Generate career advice (query params) |
| POST | `/api/insights` | Generate career advice (free-text body) |
| GET | `/api/overview` | Aggregated data-only overview |
| POST | `/api/synthesis` | Combine two text inputs (real-time + government) into one report |
| POST | `/api/roadmap` | Generate a structured skill development roadmap (LLM) |
| POST | `/api/prompt` | Direct Gemini (LLM) pass-through prompt |
| POST | `/api/explore` | Unified consolidated answer (career + external geo/policy) |
| POST | `/api/job-prep` | End-to-end job prep (gap analysis + roadmap + strategy) |
| POST | `/api/interview-prep` | Interview prep (common questions + skills focus) from a job JSON |
| POST | `/api/resume/optimize` | Optimize resume (ATS score, keyword gaps, rewrites) |
| POST | `/api/jobs/match` | Search ingested jobs in BigQuery (deterministic JSON) |

Notes:
- This endpoint aggregates data from BigQuery only (no Gemini/LLM calls).
- Accepts optional query parameters to personalize results.

## 🔧 Usage Examples (copy/paste)

### 1. Initialize the System
```bash
curl -X POST http://localhost:3000/api/setup
```

### 2. Ingest News Articles
```bash
curl -X POST http://localhost:3000/api/ingest/news \
  -H "Content-Type: application/json" \
  -d '{
    "query": "artificial intelligence, machine learning, data science",
    "pageSize": 20
  }'
```

Notes:
- `query` accepts comma-separated keywords (e.g., `"python3, data engineering, cloud"`).
- Optional flags:
  - `strict`: boolean; when `true`, disables common keyword tagging.
  - `includeCommonTagKeywords`: boolean; when provided and `strict` is not `true`, controls adding common tags.
  - `includeTrends`: boolean; when `true`, also fetches Google Trends (returned in response only).
  - `trendsTimeRange`: string; Google Trends timeframe (e.g., `"now 7-d"`, `"today 12-m"`).
  - `trendsGeo`: string; Google Trends GEO filter (e.g., `"US"`, `"IN"`).

Ingest News + Google Trends (response-only):
```bash
curl -X POST http://localhost:3000/api/ingest/news \
  -H "Content-Type: application/json" \
  -d '{
    "query": "python3, data engineering, cloud",
    "pageSize": 30,
    "includeTrends": true,
    "trendsTimeRange": "now 7-d",
    "trendsGeo": "US"
  }'
```

### 3. Get Career Insights (GET)
```bash
curl "http://localhost:3000/api/insights?skills=python,javascript,react&role=software%20engineer&experience=mid-level"
```

### Interview Prep (from a Job JSON)

Request:
```bash
curl -sS -X POST http://localhost:3000/api/interview-prep \
  -H "Content-Type: application/json" \
  -d '{
    "job": {
      "job_id": "URZN3hptJeoJpGr6AAAAAA==",
      "title": "AI Senior Software Engineer",
      "company_name": "General Motors",
      "location": "Austin",
      "employment_type": "Full-time",
      "description": "PASTE FULL JOB DESCRIPTION HERE",
      "requiredSkills": [],
      "fitScore": 89
    }
  }' | jq
```

Response (shape):
```json
{
  "success": true,
  "interviewPrepData": {
    "commonQuestions": ["..."],
    "keySkillsFocus": ["..."]
  }
}
```

Career Insights (POST, free text only):
```bash
curl -X POST 'http://localhost:3000/api/insights' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "profileFreeText": "How can I advance my career to become a top software engineer, and what skills, projects, and strategies should I focus on?"
  }'
```

### 4. Check System Status
```bash
curl http://localhost:3000/api/status
```

### 5. Get Trending Topics
```bash
curl "http://localhost:3000/api/trends?days=7"
```

### 6. Get Overview (Aggregated, data-only)

Basic (defaults: `days=7`, `limit=10`):
```bash
curl "http://localhost:3000/api/overview" | jq
```

With preferences (role + skills + interests):
```bash
curl "http://localhost:3000/api/overview?role=data%20scientist&skills=python,ml,genai&interests=healthcare,cloud&days=14&limit=8" | jq
```

Educator example:
```bash
curl "http://localhost:3000/api/overview?role=english%20teacher&skills=curriculum%20design,edtech&interests=assessment,ai%20literacy&days=30" | jq
```

Entrepreneur example:
```bash
curl "http://localhost:3000/api/overview?role=entrepreneur&skills=go-to-market,product%20design&interests=edtech,genai&days=21&limit=6" | jq
```

Use user-provided keywords for industry news (query/q):
```bash
curl "http://localhost:3000/api/overview?q=student%20visa,H1B,OPT&role=masters%20student&interests=usa,education&days=30&limit=8" | jq '.overview.industryNews.personalized'
```

Custom emerging topics:
```bash
curl "http://localhost:3000/api/overview?emerging=ai%20safety,agentic%20workflows,vector%20databases&role=entrepreneur&interests=genai,edtech&days=21" | jq '.overview.emergingTechnologies'
```

Overview response structure (high level):
```json
{
  "success": true,
  "period": { "days": 7 },
  "preferences": { "role": "...", "skills": ["..."], "interests": ["..."] },
  "overview": {
    "trendingSkills": { "general": [], "personalized": [] },
    "industryNews": { "personalized": [], "profileRelated": [] },
    "marketInsights": { "topSources": [], "volumeByDay": [] },
    "governmentPoliciesAndRegulations": [],
    "emergingTechnologies": []
  }
}
```

Query parameters:
- `role`: string (e.g., `data scientist`, `english teacher`)
- `skills`: comma-separated (e.g., `python,ml,genai`)
- `interests`: comma-separated (e.g., `healthcare,cloud`)
- `days`: lookback window in days (default `7`)
- `limit`: max items per section (default `10`)
- `query` or `q`: comma-separated keywords for personalized industry news; if omitted, derived from `skills + interests + role`
- `policy`: comma-separated keywords for Government Policies & Regulations; if omitted, falls back to a curated policy list plus tokens from `interests` and `role`
- `emerging`: comma-separated keywords for Emerging Technologies; if omitted, sensible defaults are used

Fallback behavior:
- The service prefers user-provided lists (`query/q`, `policy`, `emerging`). When these are empty, it derives sensible defaults from `skills`, `interests`, and `role` (or curated baselines) to keep results useful.

### 7. Generate a Roadmap (AI-Generated)

Structured multi-phase upskilling roadmap for a target role. Returns JSON with `roadmap` (phases/milestones) + `certifications`.

Basic example:
```bash
curl -X POST http://localhost:3000/api/roadmap \
  -H "Content-Type: application/json" \
  -d '{
    "roadmapName": "Full-Stack Developer",
    "skills": "HTML,CSS,JavaScript,React",
    "currentExperience": "6 months frontend"
  }' | jq
```

Minimal (model infers everything):
```bash
curl -X POST http://localhost:3000/api/roadmap \
  -H "Content-Type: application/json" \
  -d '{"roadmapName":"DevOps Engineer"}' | jq
```

Fields (body):
- `roadmapName` (or `title` / `role`): target role (required)
- `skills`: comma-separated or array of existing skills
- `currentExperience`: free-text description (optional)
- `targetDuration`: hint like `9 months` (optional)

### 7b. Match Jobs (Ingested BigQuery Search)

Deterministic job matching (no agent/LLM required). Searches your ingested jobs stored in BigQuery.

```bash
curl -sS -X POST http://localhost:3000/api/jobs/match \
  -H "Content-Type: application/json" \
  -d '{
    "query": "data scientist python ml azure databricks",
    "location": "Bengaluru",
    "limit": 20
  }' | jq
```

Response shape:
```json
{
  "success": true,
  "source": "bigquery",
  "query": "...",
  "location": "...",
  "count": 0,
  "jobs": [
    {
      "job_id": "...",
      "title": "...",
      "company_name": "...",
      "location": "...",
      "employment_type": "...",
      "description": "...",
      "apply_link": "...",
      "ingested_at": "..."
    }
  ]
}
```

Response (shape example – abbreviated):
```json
{
  "success": true,
  "roadmap": {
    "title": "Full-Stack Developer",
    "totalDuration": "9 months",
    "completionRate": 35,
    "phases": [
      { "id": 1, "title": "Frontend Fundamentals", "duration": "2 months", "status": "completed", "progress": 100, "milestones": [ { "id": 1, "title": "HTML & CSS Mastery", "type": "course" } ] }
    ]
  },
  "certifications": [
    { "name": "AWS Cloud Practitioner", "provider": "AWS", "difficulty": "Beginner", "priority": "Recommended" }
  ]
}
```

Error example if model output malformed:
```json
{ "success": false, "error": "Failed to parse model JSON", "raw": "...truncated model text..." }
```

### 8. Direct Prompt (LLM Pass-through)

Send any prompt directly to the configured Gemini model.
```bash
curl -X POST http://localhost:3000/api/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"List 3 concise emerging AI infrastructure trends."}' | jq
```

Optional body fields:
- `temperature`: number (e.g. 0.2)
- `maxTokens`: integer cap (omit for natural length)
- `responseMimeType`: e.g. `text/markdown` or `application/json`

Response:
```json
{ "success": true, "output": "1. ...", "finishReason": "STOP" }
```

Notes:
- `/api/roadmap` and `/api/prompt` invoke the LLM; latency & costs depend on model configuration.
- Keep prompts concise to reduce token usage and avoid truncation.

### 9. Job Prep (End-to-End Career Preparation)

Generate a comprehensive career preparation plan including gap analysis, learning roadmap, and tailored strategy for either **jobs** or **startups**.

**Supported Career Paths:**
- `job` - Traditional employment (default)
- `startup` - Founding or joining early-stage startups

Basic example (job path):
```bash
curl -X POST http://localhost:3000/api/job-prep \
  -H "Content-Type: application/json" \
  -d '{
    "targetRole": "Senior Backend Engineer",
    "currentSkills": "Python, Django, PostgreSQL",
    "experience": "3 years",
    "location": "San Francisco",
    "careerPath": "job"
  }' | jq
```

Startup founder example:
```bash
curl -X POST http://localhost:3000/api/job-prep \
  -H "Content-Type: application/json" \
  -d '{
    "targetRole": "AI SaaS Founder",
    "currentSkills": "Python, Machine Learning, Product Management",
    "experience": "5 years as ML Engineer",
    "careerPath": "startup"
  }' | jq
```

Fields (body):
- `targetRole` (string, required): Target job title or founder role
- `currentSkills` (string, optional): Comma-separated skills
- `experience` (string, optional): Years or description
- `location` (string, optional): City or region (enables job search)
- `careerPath` (string, optional): `"job"` or `"startup"` (default: `"job"`)
- `targetDuration` (string, optional): Timeline hint like `"3 months"`

Response structure:
```json
{
  "success": true,
  "targetRole": "Senior Backend Engineer",
  "careerPath": "job",
  "result": {
    "assumptions": ["..."],
    "gapAnalysis": {
      "strengths": ["..."],
      "gaps": ["..."],
      "prioritySkills": ["..."]
    },
    "learningPlan": {
      "roadmapSummary": "...",
      "weeklyPlan": [
        { "week": 1, "focus": "...", "deliverables": ["..."] }
      ]
    },
    "careerStrategy": {
      "recommendedPaths": ["..."],
      "opportunities": [
        { "type": "job", "title": "...", "company": "...", "location": "...", "whyFit": "..." }
      ],
      "actionPlan": ["..."]
    },
    "startupGuidance": {
      "mvpSteps": [],
      "fundingOptions": [],
      "networking": []
    }
  }
}
```

**For startup path**, `startupGuidance` includes:
- `mvpSteps`: Actionable steps to build MVP
- `fundingOptions`: Bootstrapping, angels, accelerators
- `networking`: Y Combinator, local tech meetups

### 10. Resume Optimization

Analyze and optimize resumes for ATS compatibility. Supports **plain text** and **LaTeX** formats (auto-detected).

Basic example:
```bash
curl -X POST http://localhost:3000/api/resume/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "Software Engineer with 3 years experience. Built REST APIs using Node.js, React, PostgreSQL. Led team of 2 developers. Skills: JavaScript, React, Node.js, Docker",
    "targetRole": "Senior Full-Stack Engineer"
  }' | jq
```

With job description (for targeted optimization):
```bash
curl -X POST http://localhost:3000/api/resume/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "Data Analyst with 2 years experience in SQL, Python, Excel. Created dashboards and analyzed customer data. Skills: SQL, Python, Tableau",
    "targetRole": "Senior Data Scientist",
    "jobDescription": "Looking for Senior Data Scientist with Python, ML, TensorFlow, AWS. 5+ years experience required."
  }' | jq
```

LaTeX resume (auto-converts to plain text):
```bash
curl -X POST http://localhost:3000/api/resume/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "\\documentclass{article}\n\\begin{document}\n\\section{Experience}\n\\textbf{DevOps Engineer} at Tech Corp\n\\begin{itemize}\n\\item Built CI/CD pipelines\n\\item Managed Kubernetes clusters\n\\end{itemize}\n\\end{document}",
    "targetRole": "Senior DevOps Engineer"
  }' | jq
```

Fields (body):
- `resumeText` (string, required): Resume content (plain text or LaTeX)
- `targetRole` (string, optional): Target job title
- `jobDescription` (string, optional): Job description for keyword alignment

Response structure:
```json
{
  "success": true,
  "result": {
    "atsScore": 65,
    "rationale": "...",
    "topFixes": ["...", "..."],
    "keywordGap": {
      "missing": ["CI/CD", "Terraform", "AWS"],
      "underrepresented": ["Kubernetes"],
      "recommendedAdditions": [
        { "keyword": "Terraform", "where": "skills section" }
      ]
    },
    "rewrittenBullets": [
      { "original": "...", "improved": "..." }
    ],
    "skillsSection": {
      "core": ["Python", "SQL"],
      "tools": ["Docker", "Kubernetes"],
      "cloud": ["AWS", "GCP"],
      "data": [],
      "other": []
    },
    "formattingNotes": ["Remove tables", "Use standard headers"]
  },
  "resumeFormatDetected": "latex",
  "generatedAt": "2026-01-05T10:30:00Z"
}
```

**Output includes:**
- `atsScore`: 0-100 ATS compatibility score
- `topFixes`: 3-5 critical improvements
- `keywordGap`: Missing/underrepresented keywords
- `rewrittenBullets`: 6-10 improved bullet points
- `skillsSection`: Categorized skills (core/tools/cloud/data/other)
- `formattingNotes`: ATS-blocking issues (tables, columns, special chars)

### 11. Explore (Unified Career + Geo/Policy Consolidation)

Generates one cohesive expert answer by:
1. Producing internal career insights (skills, trends, advice) using stored news + LLM.
2. Querying an external geo/policy intelligence API (`GEO_DATA_API_URL` → `/query`).
3. Synthesizing both sources into a single narrative (no sections or bullets) referencing trends and policy context.

Basic (single consolidated answer):
```bash
curl -X POST http://localhost:3000/api/explore \
  -H 'Content-Type: application/json' \
  -d '{
    "question":"What are the cybersecurity risks for AI adoption in India?",
    "profile": { "role": "security engineer", "experience": "mid-level" }
  }' | jq
```

Verbose (adds metadata – still only one unified answer, no raw geo payload):
```bash
curl -X POST 'http://localhost:3000/api/explore?verbose=true' \
  -H 'Content-Type: application/json' \
  -d '{"question":"What are the cybersecurity risks for AI adoption in India?","profile":{"role":"security engineer"}}' | jq
```

Verbose + Debug (includes raw external geo/policy payload for inspection):
```bash
curl -X POST 'http://localhost:3000/api/explore?verbose=true&debug=true' \
  -H 'Content-Type: application/json' \
  -d '{"question":"What are the cybersecurity risks for AI adoption in India?"}' | jq '.geo'
```

Request body fields:
- `question` (string) – required for meaningful output.
- `profile` (object, optional): `{ role, skills, experience, interests, location, profileFreeText }`.
- Legacy top-level `role`, `skills`, etc. are merged if provided.
- `includeTrending` (boolean, default `true`) – disable if you want to skip trending skill context.

Query params:
- `verbose=true` → include metadata (career + geo success flags, timing).
- `debug=true` (with verbose) → expose raw external payload (`geo.payload`).

Response (non-verbose):
```json
{
  "success": true,
  "question": "...",
  "answer": "<single unified narrative>",
  "generatedAt": "2025-09-29T13:56:41.996Z",
  "latencyMs": 51272
}
```

Response (verbose):
```json
{
  "success": true,
  "question": "...",
  "answer": "<single unified narrative>",
  "career": { "success": true, "articleCount": 1584, "trendingCount": 10 },
  "geo": { "success": true },
  "profile": { "role": "security engineer", "experience": "mid-level" },
  "generatedAt": "2025-09-29T13:56:41.996Z",
  "latencyMs": 51272,
  "mode": "verbose"
}
```

Verbose + debug (`geo.payload` included) uses `mode: "verbose+debug"`.

Timeouts & Control:
- External geo request timeout defaults to 45s. Adjust with `GEO_QUERY_TIMEOUT_MS` (set `0` for no timeout—use with caution).
- If the external service is missing or times out, the unified answer still returns (with a brief acknowledgement once, no second answer).

Design Choices:
- Always returns a single human-readable answer to avoid duplication or multi-part confusion.
- Raw geo/policy result hidden unless debug mode enabled.
- No markdown to avoid model MIME constraints; output is plain text.

Potential Extensions (not yet implemented):
- `concise=true` query param for ultra-short summaries.
- Streaming response mode (Server-Sent Events or chunked transfer).
- Caching layer for identical question/profile pairs.


## 🧩 New: Synthesis (Combine two texts)

Purpose: Send two text chunks (real-time career insights + government dataset insights) and receive a unified, user-friendly Markdown report.

Endpoint:
```
POST /api/synthesis
```

Body:
```json
{
  "realTimeText": "string (optional)",
  "governmentText": "string (optional)",
  "role": "string (optional)",
  "question": "string (optional)"
}
```

Example:
```bash
curl -X POST 'http://localhost:3000/api/synthesis' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "realTimeText": "Recent job postings show surging demand for AI platform engineers with experience in vector databases and RAG.",
    "governmentText": "Labor statistics indicate stable growth in software occupations with grants targeting AI in healthcare.",
    "role": "software engineer"
  }' | jq -r '.synthesis.reportMarkdown'
```

Response (abridged):
```json
{
  "success": true,
  "synthesis": {
    "role": "software engineer",
    "reportMarkdown": "# Executive Summary...",
    "finishReason": "STOP"
  },
  "inputs": { "realTimeTextLength": 123, "governmentTextLength": 234 },
  "metadata": { "generatedAt": "2025-09-22T12:34:56Z" }
}
```

Notes:
- At least one of `realTimeText` or `governmentText` must be provided.
 - Output is detailed by default; check `finishReason` to confirm completion.

## 📊 API Request/Response Examples

### Ingest News Request
```json
{
  "query": "artificial intelligence career opportunities",
  "pageSize": 15,
  "domains": "techcrunch.com,wired.com"
}
```

### Ingest News Response
```json
{
  "success": true,
  "message": "News ingested successfully",
  "ingested": 15,
  "totalFound": 1247,
  "query": "artificial intelligence career opportunities"
}
```

### Ingest News + Trends Response (abridged)
```json
{
  "success": true,
  "message": "News ingested successfully",
  "ingested": 18,
  "totalFound": 24,
  "query": "python3, data engineering, cloud",
  "trends": {
    "terms": ["python3", "data engineering", "cloud"],
    "timeframe": "now 7-d",
    "interestOverTime": [
      { "term": "python3", "points": [{ "time": "Sep 12 – 18", "value": 63 }] }
    ],
    "relatedQueries": [
      { "term": "python3", "queries": [{ "query": "python 3.12", "value": 85 }] }
    ]
  }
}
```

### Career Insights Request
```
GET /api/insights?skills=python,machine-learning&role=data-scientist&experience=senior&interests=ai,healthcare
```

### Career Insights Response
```json
{
  "success": true,
  "insights": {
    "aiAdvice": "Based on current trends in AI and healthcare...",
    "trending": [
      {"skill": "machine-learning", "mentions": 45},
      {"skill": "python", "mentions": 38}
    ],
    "userProfile": {
      "skills": "python,machine-learning",
      "role": "data-scientist",
      "experience": "senior"
    },
    "metadata": {
      "articleCount": 1250,
      "trendsAnalyzed": 10,
      "generatedAt": "2024-01-15T10:30:00Z"
    }
  }
}
```

## 🔑 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PROJECT_ID` | Google Cloud Project ID | - | ✅ |
| `NEWS_API_KEY` | NewsAPI.org API key | - | ✅ |
| `BQ_DATASET` | BigQuery dataset name | `career_insights` | ❌ |
| `BQ_NEWS_TABLE` | BigQuery table name | `news_articles` | ❌ |
| `LOCATION` | Google Cloud region | `us-central1` | ❌ |
| `VERTEX_GEN_MODEL` | Vertex AI model name | `gemini-2.5-flash` | ❌ |
| `PORT` | Server port | `3000` | ❌ |
| `GEO_DATA_API_URL` | Base URL of external geo/policy enrichment service (must expose POST /query) | - | ❌ |
| `GEO_QUERY_TIMEOUT_MS` | Timeout (ms) for geo/policy request (0 = no timeout) | `45000` | ❌ |

## 🧪 Testing

### Test News Fetching (No Storage)
```bash
curl -X POST http://localhost:3000/api/test/news \
  -H "Content-Type: application/json" \
  -d '{"query": "startup funding 2024"}'
```

### Health Checks
```bash
# Basic health
curl http://localhost:3000/health

# Detailed status (includes all components)
curl http://localhost:3000/api/status
```

## 🚨 Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad Request (missing parameters)
- `401`: Authentication Error  
- `429`: Rate Limit Exceeded
- `500`: Internal Server Error
- `503`: Service Unavailable (dependencies down)

## 📝 Development

### Scripts
```bash
npm start     # Production server
npm run dev   # Development with nodemon
npm test      # Run tests (when implemented)
```

### Adding New Features
1. **New API endpoints**: Add to `src/routes/insightsRoutes.js`
2. **Business logic**: Extend `src/services/careerInsightsService.js`
3. **External APIs**: Add clients to `src/utils/`
4. **GCP integrations**: Extend clients in `src/gcpclient/` or `src/vertexclient/`
