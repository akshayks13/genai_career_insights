import express from 'express';
import careerInsightsService from '../services/careerInsightsService.js';
import overviewService from '../services/overviewService.js';
import synthesisService from '../services/synthesisService.js';
import geminiClient from '../vertexclient/geminiClient.js';

const router = express.Router();

// Setup endpoint - Initialize BigQuery dataset and table
router.post('/setup', async (req, res) => {
  try {
    const result = await careerInsightsService.setupDatabase();
    res.json(result);
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ingest news endpoint
router.post('/ingest/news', async (req, res) => {
  try {
    // Accept from body or query string for convenience
    const { pageSize, domains, sources, includeCommonTagKeywords, strict, includeTrends, trendsTimeRange, trendsGeo } = req.body || {};
    const query = (req.body?.query || req.query.query || req.query.q || '').trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Provide 'query' in JSON body or ?query=..."
      });
    }

    const result = await careerInsightsService.ingestNews(query, {
      pageSize,
      domains,
      sources,
      includeTrends,
      trendsTimeRange,
      trendsGeo,
      // If strict is true, turn off common keyword tagging; otherwise honor includeCommonTagKeywords if provided
      includeCommonTagKeywords: strict === true ? false : includeCommonTagKeywords
    });

    res.json(result);
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generate career insights endpoint
router.get('/insights', async (req, res) => {
  try {
    const userProfile = {
      skills: req.query.skills || '',
      role: req.query.role || 'software engineer',
      experience: req.query.experience || 'mid-level',
      interests: req.query.interests || '',
      location: req.query.location || ''
    };

    const result = await careerInsightsService.generateCareerInsights(userProfile);
    res.json(result);
  } catch (error) {
    console.error('Insights error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST endpoint to accept long natural-language profile text
router.post('/insights', async (req, res) => {
  try {
    const { profileFreeText = '', role = '', experience = '', skills = '', interests = '', location = '' } = req.body || {};

    const userProfile = {
      profileFreeText,
      skills,
      role,
      experience,
      interests,
      location
    };

    const result = await careerInsightsService.generateCareerInsights(userProfile);
    res.json(result);
  } catch (error) {
    console.error('Insights (POST) error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// System status endpoint
router.get('/status', async (req, res) => {
  try {
    const status = await careerInsightsService.getSystemStatus();
    const httpStatus = status.overall === 'healthy' ? 200 : 503;
    res.status(httpStatus).json(status);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      service: 'career-insights-api',
      timestamp: new Date().toISOString(),
      overall: 'error',
      error: error.message
    });
  }
});

// Quick test endpoint for news fetching (without BigQuery)
router.post('/test/news', async (req, res) => {
  try {
    const { query = 'artificial intelligence career' } = req.body;
    
    // Import newsApiClient directly for testing
    const { default: newsApiClient } = await import('../utils/newsApiClient.js');
    const result = await newsApiClient.fetchNews(query, { pageSize: 5 });
    
    res.json({
      success: true,
      message: 'News fetched successfully (test mode)',
      ...result
    });
  } catch (error) {
    console.error('News test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get trending topics
router.get('/trends', async (req, res) => {
  try {
    const days = Number.parseInt(req.query.days) || 7;
    const format = (req.query.format || 'card').toLowerCase(); // 'card' | 'raw'
    const limitParam = Number.parseInt(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 10;

    // Import bigqueryClient directly
    const { default: bigqueryClient } = await import('../gcpclient/bigqueryClient.js');
    const trends = await bigqueryClient.queryTopTrends(days);
    const top = Array.isArray(trends) ? trends.slice(0, limit) : [];

    // Raw format for backward compatibility
    if (format === 'raw') {
      return res.json({
        success: true,
        trends: top,
        period: `${days} days`,
        count: top.length
      });
    }

    // If no data, return empty cards list gracefully
    if (!top.length) {
      return res.json({ success: true, cards: [], period: `${days} days`, count: 0 });
    }

    // Build a concise prompt asking Gemini to format cards exactly
    const skillsList = top
      .map((r, i) => `${i + 1}. ${r.skill} — mentions: ${r.mentions}`)
      .join('\n');

    const prompt = `You are a concise career market analyst. Based on the following skills and their news mention counts from the last ${days} days, output compact "cards" for each skill in EXACTLY this 6-line block format:

<Name>
<+GrowthPercent%>
Demand:
<High|Medium|Low>
Avg. Salary:
<$###k+ or $###k-$###k>

Strict formatting rules:
- Output one block per skill, in the same order as provided, separated by a single blank line.
- Do NOT include numbering, bullets, commentary, headings, or extra text.
- "GrowthPercent" is your best short-term estimate vs typical baseline; if uncertain, keep between +0% and +5%.
- "Avg. Salary" is the Indian mid-level average using Rupee (₹) and k shorthand (e.g., ₹110k+).
- Keep it succinct and realistic. No disclaimers.

Skills and mentions (higher suggests higher demand):
${skillsList}`;

    // Ask Gemini to produce the cards
    const gen = await geminiClient.generateContent(prompt, { responseMimeType: 'text/plain' });
    const text = (gen && gen.text ? String(gen.text) : '').trim();

    // Split output into individual cards (blocks separated by blank line)
    const cards = text
      .split(/\n\s*\n/)
      .map(s => s.trim())
      .filter(Boolean);

    return res.json({ success: true, cards, period: `${days} days`, count: cards.length });
  } catch (error) {
    console.error('Trends error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

// Synthesize two text inputs (real-time + government) into a combined report
router.post('/synthesis', async (req, res) => {
  try {
    const { realTimeText = '', governmentText = '', role = '', question = '' } = req.body || {};
    if (!realTimeText && !governmentText) {
      return res.status(400).json({ success: false, error: 'Provide at least one of realTimeText or governmentText' });
    }
    const result = await synthesisService.synthesize({ realTimeText, governmentText, role, question });
    res.json(result);
  } catch (error) {
    console.error('Synthesis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Direct Gemini prompt endpoint (simple pass-through)
router.post('/prompt', async (req, res) => {
  try {
    const { prompt = '', temperature, maxTokens, responseMimeType } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ success: false, error: "Provide non-empty 'prompt' in JSON body" });
    }
    const options = {
      ...(temperature !== undefined ? { temperature } : {}),
      ...(maxTokens !== undefined ? { maxTokens } : {}),
      ...(responseMimeType ? { responseMimeType } : {})
    };
    const result = await geminiClient.generateContent(prompt, options);
    res.json({ success: true, output: result.text, finishReason: result.finishReason });
  } catch (error) {
    console.error('Prompt error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Roadmap generation endpoint
router.post('/roadmap', async (req, res) => {
  try {
    const {
      roadmapName = '', // e.g., "Full-Stack Developer"
      title,            // alias
      role,             // fallback alias
      skills = '',      // comma-separated string or array
      currentExperience = '',
      targetDuration = '' // optional (e.g., "6 months")
    } = req.body || {};

    const requestedTitle = (roadmapName || title || role || '').trim();
    if (!requestedTitle) {
      return res.status(400).json({ success: false, error: 'Provide roadmapName (or title/role) in the request body.' });
    }

    let userSkills = [];
    if (Array.isArray(skills)) {
      userSkills = skills.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof skills === 'string') {
      userSkills = skills.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Build strict JSON-output prompt
    const prompt = `You are an expert career curriculum architect. Build a structured, realistic upskilling roadmap.
Target Role / Roadmap: ${requestedTitle}
User Skills (existing): ${userSkills.length ? userSkills.join(', ') : 'None provided'}
User Experience: ${currentExperience || 'Not specified'}
Preferred Total Duration (optional hint): ${targetDuration || 'Not specified'}

OUTPUT REQUIREMENTS:
Return ONLY valid minified JSON (no markdown, no commentary before/after). Shape:
{
  "roadmapData": {
    "title": string,
    "totalDuration": string, // e.g. "12 months"
    "completionRate": number, // 0-100 integer
    "phases": [
      {
        "id": number,
        "title": string,
        "duration": string, // e.g. "3 months"
        "status": "completed" | "in-progress" | "pending",
        "progress": number, // 0-100
        "milestones": [
          {
            "id": number,
            "title": string,
            "type": "course" | "project" | "certification" | "reading" | "practice",
            "duration": string, // e.g. "3 weeks"
            "status": "completed" | "in-progress" | "pending",
            "provider": string
          }
        ]
      }
    ]
  },
  "certifications": [
    {
      "name": string,
      "provider": string,
      "difficulty": "Beginner" | "Intermediate" | "Advanced",
      "duration": string,
      "value": "High" | "Medium" | "Low",
      "priority": "Recommended" | "Optional" | "Stretch"
    }
  ]
}

LOGIC & RULES:
- 4-6 phases total. Order them logically (fundamentals -> specialization -> integration -> professional polish).
- A phase or milestone is 'completed' only if its core skills are already in user skills. Partially covered => 'in-progress'. Others 'pending'.
- completionRate (%) should reflect weighted progress over all milestones.
- Milestone durations: use weeks for granular items; phase duration sum should roughly match totalDuration.
- If no targetDuration provided, choose a realistic total (e.g., 6, 9, or 12 months) based on breadth.
- Ensure IDs are unique and sequential across milestones (phase ordering preserved) but milestone IDs must not reset inside a phase in a way that conflicts.
- Tailor content to ${requestedTitle}. Avoid generic filler.
- Include at least 1 project milestone each phase (except possibly a pure certification phase).
- Keep provider names credible (Official Docs, freeCodeCamp, Coursera, AWS, etc.).
- Output VALID JSON ONLY.`;

    let aiRaw;
    try {
      aiRaw = await geminiClient.generateContent(prompt, {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxTokens: 4000
      });
    } catch (modelErr) {
      console.error('Roadmap model call failed:', modelErr);
      return res.status(500).json({ success: false, error: 'Model generation failed', details: modelErr.message });
    }

    const rawText = (aiRaw && aiRaw.text ? aiRaw.text.trim() : '');
    if (!rawText) {
      return res.status(500).json({ success: false, error: 'Empty response from model' });
    }

    // Attempt robust JSON parse (strip leading/trailing non-json if any)
    let parsed;
    try {
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      const candidate = firstBrace >= 0 && lastBrace > firstBrace ? rawText.slice(firstBrace, lastBrace + 1) : rawText;
      parsed = JSON.parse(candidate);
    } catch (parseErr) {
      console.error('Roadmap JSON parse failed. Raw text:');
      return res.status(502).json({ success: false, error: 'Failed to parse model JSON', raw: rawText });
    }

    return res.json({ success: true, roadmap: parsed.roadmapData, certifications: parsed.certifications || [], finishReason: aiRaw.finishReason });
  } catch (error) {
    console.error('Roadmap generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Overview endpoint: aggregated nested JSON for frontend dashboards
router.get('/overview', async (req, res) => {
  try {
    const prefs = {
      role: req.query.role || '',
      skills: req.query.skills || '', // comma-separated
      interests: req.query.interests || '', // comma-separated
      days: req.query.days || 7,
      limit: req.query.limit || 10,
      // user-provided queries (comma-separated or freeform)
      query: req.query.query || req.query.q || '',
      policy: req.query.policy || '',
      emerging: req.query.emerging || ''
    };

    const result = await overviewService.getOverview(prefs);
    res.json(result);
  } catch (error) {
    console.error('Overview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
