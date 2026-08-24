const path = require('path');
const dotenv = require('dotenv');
const { FunctionTool } = require('@google/adk');
const { pathToFileURL } = require('url');

function normalizeToolResult(result) {
  if (result === undefined) return {};
  if (result === null) return { value: null };
  if (Array.isArray(result)) return { items: result };
  if (typeof result === 'object') return result;
  return { value: result };
}

function throwAdkJsonError(code, message) {
  throw new Error(JSON.stringify({ error: { code, message } }));
}

function loadEnvFromRepoRoot(fromDir) {
  dotenv.config({ path: path.resolve(fromDir, '../../.env') });
}

function makeTool(definition) {
  return new FunctionTool(definition);
}

function importService(serviceFileName) {
  // Resolve services relative to the repo root (career_insights/), not process.cwd().
  const absPath = path.resolve(__dirname, '../src/services', serviceFileName);
  return import(pathToFileURL(absPath).href);
}

function makeTools() {
  const ingestNewsTool = makeTool({
    name: 'ingestNews',
    description: 'Ingests news articles based on a query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The topic to search for news about.' },
        pageSize: { type: 'number', description: 'Number of articles to fetch.' },
        includeTrends: { type: 'boolean', description: 'Whether to include Google Trends data.' }
      },
      required: ['query']
    },
    execute: async ({ query, pageSize, includeTrends }) => {
      const svc = (await importService('careerInsightsService.js')).default;
      return normalizeToolResult(await svc.ingestNews(query, { pageSize, includeTrends }));
    }
  });

  const ingestJobsTool = makeTool({
    name: 'ingestJobs',
    description: 'Ingests job postings from RapidAPI based on a query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Job search query (e.g., "software engineer in india").' },
        page: { type: 'number', description: 'Page number for pagination.' }
      },
      required: ['query']
    },
    execute: async ({ query, page }) => {
      const svc = (await importService('jobsService.js')).default;
      return normalizeToolResult(await svc.fetchAndIngestRapidJobs({ query, page }));
    }
  });

  const getCareerInsightsTool = makeTool({
    name: 'getCareerInsights',
    description: 'Generates career insights based on a user profile.',
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Current role of the user.' },
        skills: { type: 'string', description: 'Comma-separated list of skills.' },
        experience: { type: 'string', description: 'Experience level (e.g., "mid-level").' },
        profileFreeText: { type: 'string', description: 'Additional context about the user.' }
      }
    },
    execute: async (userProfile) => {
      const svc = (await importService('careerInsightsService.js')).default;
      const hasRole = Boolean(userProfile?.role && String(userProfile.role).trim());
      const hasFreeText = Boolean(userProfile?.profileFreeText && String(userProfile.profileFreeText).trim());
      if (!hasRole && !hasFreeText) {
        throwAdkJsonError(400, "getCareerInsights requires either 'role' or 'profileFreeText'.");
      }
      return normalizeToolResult(await svc.generateCareerInsights(userProfile));
    }
  });

  const generateRoadmapTool = makeTool({
    name: 'generateRoadmap',
    description: 'Builds a structured skill-gap roadmap (phases + milestones + suggested certifications) for a target role.',
    parameters: {
      type: 'object',
      properties: {
        targetRole: { type: 'string', description: 'The target role/title to build a roadmap for.' },
        skills: { type: 'string', description: 'Comma-separated current skills.' },
        currentExperience: { type: 'string', description: 'Current experience (free text).' },
        targetDuration: { type: 'string', description: 'Optional hint like "6 months" / "12 months".' }
      },
      required: ['targetRole']
    },
    execute: async ({ targetRole, skills, currentExperience, targetDuration }) => {
      const svc = (await importService('roadmapService.js')).default;
      return normalizeToolResult(await svc.generateRoadmap({ targetRole, skills, currentExperience, targetDuration }));
    }
  });

  const exploreRagTool = makeTool({
    name: 'exploreRag',
    description: 'Retrieves and consolidates market signals + geo/policy context into a single verified answer.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'User question to investigate.' },
        role: { type: 'string', description: 'Optional role context.' },
        skills: { type: 'string', description: 'Optional skills context.' },
        experience: { type: 'string', description: 'Optional experience level.' },
        interests: { type: 'string', description: 'Optional interests.' },
        location: { type: 'string', description: 'Optional location.' },
        profileFreeText: { type: 'string', description: 'Optional full user narrative.' },
        includeTrending: { type: 'boolean', description: 'Include trending skills signal (default true).' }
      },
      required: ['question']
    },
    execute: async ({ question, includeTrending, ...profile }) => {
      const svc = (await importService('ragIntelligenceService.js')).default;
      return normalizeToolResult(await svc.explore({ question, profile, includeTrending: includeTrending !== false }));
    }
  });

  const searchJobsTool = makeTool({
    name: 'searchJobs',
    description: 'Searches for jobs using the Talent API.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
        location: { type: 'string', description: 'Location filter.' }
      },
      required: ['query']
    },
    execute: async ({ query, location }) => {
      const svc = (await importService('jobsService.js')).default;
      return normalizeToolResult(await svc.talentSearchJobs({ query, location }));
    }
  });

  const getOverviewTool = makeTool({
    name: 'getOverview',
    description: 'Provides a market overview.',
    parameters: {
      type: 'object',
      properties: {
        industry: { type: 'string', description: 'Industry to analyze (maps to query).' },
        role: { type: 'string', description: 'Role to analyze.' },
        skills: { type: 'string', description: 'Skills to analyze.' }
      },
      required: []
    },
    execute: async ({ industry, role, skills }) => {
      const svc = (await importService('overviewService.js')).default;
      return normalizeToolResult(await svc.getOverview({ query: industry, role, skills }));
    }
  });

  const synthesizeReportTool = makeTool({
    name: 'synthesizeReport',
    description: 'Synthesizes a comprehensive report from text sources.',
    parameters: {
      type: 'object',
      properties: {
        realTimeText: { type: 'string', description: 'Text from real-time insights.' },
        governmentText: { type: 'string', description: 'Text from government datasets.' },
        role: { type: 'string', description: 'Target role for the report.' },
        question: { type: 'string', description: 'Specific question to answer.' }
      },
      required: ['realTimeText', 'governmentText']
    },
    execute: async ({ realTimeText, governmentText, role, question }) => {
      const svc = (await importService('synthesisService.js')).default;
      return normalizeToolResult(await svc.synthesize({ realTimeText, governmentText, role, question }));
    }
  });

  const getTrendingSkillsTool = makeTool({
    name: 'getTrendingSkills',
    description: 'Retrieves top trending skills from news mentions over a specified period with growth indicators and demand levels.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Lookback period in days (default: 7, max: 90).' },
        limit: { type: 'number', description: 'Max number of trending skills to return (default: 10, max: 20).' }
      },
      required: []
    },
    execute: async ({ days = 7, limit = 10 }) => {
      const bigqueryClient = (await import(pathToFileURL(path.resolve(__dirname, '../src/gcpclient/bigqueryClient.js')).href)).default;
      const trends = await bigqueryClient.queryTopTrends(Math.min(days || 7, 90));
      const top = Array.isArray(trends) ? trends.slice(0, Math.min(limit || 10, 20)) : [];
      return normalizeToolResult({ trends: top, period: `${days} days`, count: top.length });
    }
  });

  const getLatestJobsTool = makeTool({
    name: 'getLatestJobs',
    description: 'Fetches the most recently ingested jobs from BigQuery database (bypasses Talent API search).',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of jobs to return (default: 20, max: 100).' }
      },
      required: []
    },
    execute: async ({ limit = 20 }) => {
      const jobsServiceModule = await importService('jobsService.js');
      const jobs = await jobsServiceModule.bqFetchLatestJobs({ limit: Math.min(limit || 20, 100) });
      return normalizeToolResult({ jobs, count: jobs.length, source: 'bigquery' });
    }
  });

  const validateSkillsAgainstMarketTool = makeTool({
    name: 'validateSkillsAgainstMarket',
    description: 'Validates a list of user skills against current market demand and trending data to identify which are in-demand, emerging, or declining.',
    parameters: {
      type: 'object',
      properties: {
        skills: { type: 'string', description: 'Comma-separated list of skills to validate.' },
        targetRole: { type: 'string', description: 'Optional: target role context for relevance scoring.' }
      },
      required: ['skills']
    },
    execute: async ({ skills, targetRole }) => {
      const bigqueryClient = (await import(pathToFileURL(path.resolve(__dirname, '../src/gcpclient/bigqueryClient.js')).href)).default;
      const skillsArray = skills.split(',').map(s => s.trim()).filter(Boolean);
      const trends = await bigqueryClient.queryTopTrends(30);
      
      const validation = skillsArray.map(skill => {
        const match = trends.find(t => 
          t.skill.toLowerCase().includes(skill.toLowerCase()) || 
          skill.toLowerCase().includes(t.skill.toLowerCase())
        );
        return {
          skill,
          inDemand: !!match,
          mentions: match?.mentions || 0,
          rank: match ? trends.indexOf(match) + 1 : null,
          status: match ? (match.mentions > 50 ? 'high-demand' : 'moderate-demand') : 'low-signal'
        };
      });
      
      return normalizeToolResult({
        validatedSkills: validation,
        totalSkills: skillsArray.length,
        inDemandCount: validation.filter(v => v.inDemand).length,
        targetRole
      });
    }
  });

  const optimizeResumeTool = makeTool({
    name: 'optimizeResume',
    description: 'Optimizes a resume for ATS and a target role/job description.',
    parameters: {
      type: 'object',
      properties: {
        resumeText: { type: 'string', description: 'Raw resume text (plain text or LaTeX).' },
        targetRole: { type: 'string', description: 'Target role/title to optimize for (optional but recommended).' },
        jobDescription: { type: 'string', description: 'Job description text to align keywords to (optional).' }
      },
      required: ['resumeText']
    },
    execute: async ({ resumeText, targetRole = '', jobDescription = '' }) => {
      const resume = String(resumeText || '').trim();
      if (!resume) throwAdkJsonError(400, "'resumeText' is required");
      const svc = (await importService('resumeOptimizationService.js')).default;
      const out = await svc.optimize({
        resumeText: resume,
        targetRole: String(targetRole || '').trim(),
        jobDescription: String(jobDescription || '').trim(),
      });
      return normalizeToolResult(out?.result);
    }
  });

  return {
    ingestNewsTool,
    ingestJobsTool,
    getCareerInsightsTool,
    generateRoadmapTool,
    exploreRagTool,
    searchJobsTool,
    getOverviewTool,
    synthesizeReportTool,
    getTrendingSkillsTool,
    getLatestJobsTool,
    validateSkillsAgainstMarketTool,
    optimizeResumeTool,
  };
}

module.exports = {
  loadEnvFromRepoRoot,
  makeTools,
};
