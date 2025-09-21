# Career Insights API

A modular Express.js application that fetches news articles, stores them in Google Cloud BigQuery, and generates AI-powered career insights using Google Vertex AI (Gemini).

## 🏗️ Project Structure

```
career_insights/
├── server.js                  # Entry point
├── .env                       # Environment variables
├── package.json              # Dependencies and scripts
├── .gitignore                # Git ignore rules
└── src/
    ├── gcpclient/
    │   └── bigqueryClient.js   # BigQuery operations
    ├── vertexclient/
    │   └── geminiClient.js     # Vertex AI (Gemini) client
    ├── services/
  │   ├── careerInsightsService.js  # Career insights (LLM + data)
  │   └── overviewService.js        # Aggregated data overview (data only)
    ├── routes/
    │   └── insightsRoutes.js   # API endpoints
    └── utils/
        └── newsApiClient.js    # NewsAPI integration
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd career_insights
npm install
```

### Quick run (copyable)
```bash
# from project root
cd career_insights
# copy the example env and edit values
cp .env.example .env
# install deps
npm install
# start in dev mode (requires nodemon) or start
npm run dev
```

### 2. Environment Setup
Update `.env` with your credentials:
```env
PROJECT_ID=your-google-cloud-project-id
NEWS_API_KEY=your-newsapi-key
```

### 3. Google Cloud Authentication
Choose one method:

**Option A: Service Account**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**Option B: Application Default Credentials**
```bash
gcloud auth application-default login
```

### 4. Start the Server
```bash
npm run dev  # Development with auto-reload
npm start    # Production
```

## 📡 API Endpoints

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information and available endpoints |
| GET | `/health` | Basic health check |
| GET | `/api/status` | Detailed system status |

### Setup & Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/setup` | Initialize BigQuery dataset and table |

### News & Data Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ingest/news` | Fetch and store news articles |
| POST | `/api/test/news` | Test news fetching (no storage) |
| GET | `/api/trends` | Get trending topics from stored data |

### AI Insights

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/insights` | Generate personalized career advice |

### Overview & Aggregations (Data-only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/overview` | Nested JSON with trending skills, industry news, market insights, policies, and emerging tech |

Notes:
- This endpoint aggregates data from BigQuery only (no Gemini/LLM calls).
- Accepts optional query parameters to personalize results.

## 🔧 Usage Examples

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

### 3. Get Career Insights
```bash
curl "http://localhost:3000/api/insights?skills=python,javascript,react&role=software%20engineer&experience=mid-level"
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

Explicit policy focus:
```bash
curl "http://localhost:3000/api/overview?policy=student%20visa,immigration,ferpa&role=masters%20student&skills=python&interests=usa,education&days=30" | jq '.overview.governmentPoliciesAndRegulations'
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
- `emerging`: comma-separated keywords for Emerging Technologies; if omitted, defaults to `ai, genai, blockchain, quantum, edge, robotics, biotech`

Fallback behavior:
- The service prefers user-provided lists (`query/q`, `policy`, `emerging`). When these are empty, it derives sensible defaults from `skills`, `interests`, and `role` (or curated baselines) to keep results useful.

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
| `NEWSAPI_KEY` | NewsAPI.org API key | - | ✅ |
| `BQ_DATASET` | BigQuery dataset name | `career_insights` | ❌ |
| `BQ_NEWS_TABLE` | BigQuery table name | `news_articles` | ❌ |
| `LOCATION` | Google Cloud region | `us-central1` | ❌ |
| `VERTEX_GEN_MODEL` | Vertex AI model name | `gemini-1.5-pro` | ❌ |
| `PORT` | Server port | `3000` | ❌ |

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

## 🔒 Security Notes

- Store sensitive credentials in `.env` (never commit)
- Use service accounts with minimal required permissions
- Implement rate limiting for production deployments
- Consider API authentication for public deployments

## 📈 Monitoring

The `/api/status` endpoint provides health information for:
- BigQuery connectivity and data counts
- NewsAPI key validation
- Vertex AI authentication
- Overall system health

## 🚀 Deployment

### Local Development
Already covered in Quick Start section.

### Google Cloud Run
1. Build container with Cloud Buildpacks
2. Set environment variables in Cloud Run service
3. Ensure proper IAM roles for the service account

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 📄 License

MIT License - see package.json
