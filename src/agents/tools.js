import careerInsightsService from '../services/careerInsightsService.js';
import jobsService from '../services/jobsService.js';
import overviewService from '../services/overviewService.js';
import synthesisService from '../services/synthesisService.js';
import roadmapService from '../services/roadmapService.js';
import ragIntelligenceService from '../services/ragIntelligenceService.js';
import resumeOptimizationService from '../services/resumeOptimizationService.js';

function normalizeToolResult(result) {
  if (result === undefined) return {};
  if (result === null) return { value: null };
  if (Array.isArray(result)) return { items: result };
  if (typeof result === 'object') return result;
  return { value: result };
}

function throwAdkJsonError(code, message) {
  // ADK tries to JSON.parse(error.message) for model/tool errors.
  throw new Error(JSON.stringify({ error: { code, message } }));
}

export const ingestNewsTool = {
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
    return normalizeToolResult(await careerInsightsService.ingestNews(query, { pageSize, includeTrends }));
  }
};

export const ingestJobsTool = {
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
    return normalizeToolResult(await jobsService.fetchAndIngestRapidJobs({ query, page }));
  }
};

export const getCareerInsightsTool = {
  name: 'getCareerInsights',
  description: 'Generates career insights based on a user profile.',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', description: 'Current role of the user.' },
      skills: { type: 'string', description: 'Comma-separated list of skills.' },
      experience: { type: 'string', description: 'Experience level (e.g., "mid-level").' },
      profileFreeText: { type: 'string', description: 'Additional context about the user.' }
    },
    // Validate role or profileFreeText at runtime (schema cannot use anyOf).
  },
  execute: async (userProfile) => {
    const hasRole = Boolean(userProfile?.role && String(userProfile.role).trim());
    const hasFreeText = Boolean(userProfile?.profileFreeText && String(userProfile.profileFreeText).trim());
    if (!hasRole && !hasFreeText) {
      throwAdkJsonError(400, "getCareerInsights requires either 'role' or 'profileFreeText'.");
    }
    return normalizeToolResult(await careerInsightsService.generateCareerInsights(userProfile));
  }
};

export const generateRoadmapTool = {
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
    return normalizeToolResult(await roadmapService.generateRoadmap({ targetRole, skills, currentExperience, targetDuration }));
  }
};

export const exploreRagTool = {
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
    return normalizeToolResult(await ragIntelligenceService.explore({
      question,
      profile,
      includeTrending: includeTrending !== false
    }));
  }
};

export const searchJobsTool = {
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
    return normalizeToolResult(await jobsService.talentSearchJobs({ query, location }));
  }
};

export const getOverviewTool = {
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
    // Map industry → overview query keywords
    return normalizeToolResult(await overviewService.getOverview({ query: industry, role, skills }));
  }
};

export const synthesizeReportTool = {
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
    return normalizeToolResult(await synthesisService.synthesize({ realTimeText, governmentText, role, question }));
  }
};

export const getTrendingSkillsTool = {
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
    const { default: bigqueryClient } = await import('../gcpclient/bigqueryClient.js');
    const trends = await bigqueryClient.queryTopTrends(Math.min(days || 7, 90));
    const top = Array.isArray(trends) ? trends.slice(0, Math.min(limit || 10, 20)) : [];
    return normalizeToolResult({ trends: top, period: `${days} days`, count: top.length });
  }
};

export const getLatestJobsTool = {
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
    const { bqFetchLatestJobs } = await import('../services/jobsService.js');
    const jobs = await bqFetchLatestJobs({ limit: Math.min(limit || 20, 100) });
    return normalizeToolResult({ jobs, count: jobs.length, source: 'bigquery' });
  }
};

export const matchIngestedJobsTool = {
  name: 'matchIngestedJobs',
  description: 'Searches ingested jobs stored in BigQuery (deterministic JSON; dashboard-friendly).',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query text (required).' },
      location: { type: 'string', description: 'Optional location filter.' },
      limit: { type: 'number', description: 'Max jobs to return (default: 20, max: 100).' },
      maxDescriptionChars: { type: 'number', description: 'Optional: truncate job descriptions to this many characters (default: 1200, max: 5000).' }
    },
    required: ['query']
  },
  execute: async ({ query, location = '', limit = 20, maxDescriptionChars = 1200 }) => {
    const q = String(query || '').trim();
    if (!q) throwAdkJsonError(400, "'query' is required");

    const loc = String(location || '').trim();
    const cap = Math.min(Number(limit) || 20, 100);

    const maxDesc = Math.min(Math.max(Number(maxDescriptionChars) || 1200, 0), 5000);
    const truncate = (value) => {
      if (value === null || value === undefined) return null;
      const s = String(value);
      if (!maxDesc) return null;
      return s.length > maxDesc ? `${s.slice(0, maxDesc)}…` : s;
    };

    const { bqSearchIngestedJobs } = await import('../services/jobsService.js');
    const rows = await bqSearchIngestedJobs({ query: q, location: loc, limit: cap });

    const normalizeIngestedAt = (v) => {
      if (!v) return null;
      if (typeof v === 'string') return v;
      if (v?.value) return String(v.value);
      if (v instanceof Date) return v.toISOString();
      return String(v);
    };

    const jobs = (rows || []).map((r) => ({
      job_id: r.job_id,
      title: r.title,
      company_name: r.company_name ?? null,
      location: r.location ?? null,
      employment_type: r.employment_type ?? null,
      description: truncate(r.description ?? null),
      apply_link: r.apply_link ?? null,
      ingested_at: normalizeIngestedAt(r.ingested_at)
    }));

    return normalizeToolResult({
      success: true,
      source: 'bigquery',
      query: q,
      location: loc,
      count: jobs.length,
      jobs
    });
  }
};

export const validateSkillsAgainstMarketTool = {
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
    const { default: bigqueryClient } = await import('../gcpclient/bigqueryClient.js');
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
};

export const optimizeResumeTool = {
  name: 'optimizeResume',
  description: 'Optimizes a resume for ATS and a target role/job description. Returns strict JSON suitable for dashboards.',
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

    const out = await resumeOptimizationService.optimize({
      resumeText: resume,
      targetRole: String(targetRole || '').trim(),
      jobDescription: String(jobDescription || '').trim(),
    });

    return normalizeToolResult(out?.result);
  }
};
