import newsApiClient from '../utils/newsApiClient.js';
import bigqueryClient from '../gcpclient/bigqueryClient.js';
import geminiClient from '../vertexclient/geminiClient.js';

class CareerInsightsService {
  async setupDatabase() {
    try {
      const result = await bigqueryClient.createDatasetAndTable();
      return {
        success: true,
        message: 'Database setup completed successfully',
        ...result
      };
    } catch (error) {
      console.error('Database setup failed:', error);
      throw new Error(`Database setup failed: ${error.message}`);
    }
  }

  async ingestNews(query, options = {}) {
    try {
      console.log(`📰 Fetching news for query: "${query}"`);
      
      // Fetch news from NewsAPI
      const newsResult = await newsApiClient.fetchNews(query, {
        pageSize: options.pageSize || 20,
        sortBy: 'publishedAt',
        includeCommonTagKeywords: options.includeCommonTagKeywords,
        ...options
      });

      if (newsResult.articles.length === 0) {
        return {
          success: true,
          message: 'No articles found for the given query',
          ingested: 0,
          query
        };
      }

      console.log(`Found ${newsResult.articles.length} articles, inserting into BigQuery`);
      
      // Insert into BigQuery
      const insertedCount = await bigqueryClient.insertNewsArticles(newsResult.articles);

      // Optionally fetch Google Trends snapshot without writing to DB
      let trends = undefined;
      if (options.includeTrends) {
        try {
          const { default: googleTrendsClient } = await import('../utils/googleTrendsClient.js');
          const keywords = (query || '').split(',').map(s => s.trim()).filter(Boolean);
          trends = await googleTrendsClient.getSnapshot(keywords, { timeRange: options.trendsTimeRange || 'now 7-d', geo: options.trendsGeo || '' });
        } catch (trErr) {
          console.warn('Google Trends fetch failed:', trErr.message || trErr);
        }
      }

      return {
        success: true,
        message: 'News ingested successfully',
        ingested: insertedCount,
        totalFound: newsResult.totalResults,
        query,
        ...(trends ? { trends } : {})
      };

    } catch (error) {
      console.error('News ingestion failed:', error);
      throw new Error(`News ingestion failed: ${error.message}`);
    }
  }

  async generateCareerInsights(userProfile = {}) {
    try {
      const {
        profileFreeText = '',
        skills = '',
        role = 'professional',
        experience = 'mid-level',
        interests = '',
        location = ''
      } = userProfile;

      console.log(`🤖 Generating insights for ${role} with skills: ${skills}`);
      if (profileFreeText) console.log('User narrative provided (length):', profileFreeText.length);

      // Get trending topics from BigQuery
      let trends = [];
      let trendsText = 'No trend data available';
      
      try {
        trends = await bigqueryClient.queryTopTrends(7); // Last 7 days
        if (trends.length > 0) {
          trendsText = trends
            .map(t => `${t.skill} (${t.mentions} mentions)`)
            .join(', ');
        }
      } catch (error) {
        console.warn('Could not fetch trends, using default message');
      }

      // Build comprehensive prompt
      const prompt = this.buildCareerPrompt({
        profileFreeText,
        skills,
        role,
        experience,
        interests,
        location,
        trendsText
      });

      // Generate AI insights (slightly lower temperature for crisper, more actionable output)
      const aiResponse = await geminiClient.generateContent(prompt, {
        temperature: 0.5,
        maxTokens: 1400
      });

      // Get article count for context
      let articleCount = 0;
      try {
        articleCount = await bigqueryClient.getArticleCount();
      } catch (error) {
        console.warn('Could not get article count');
      }

      return {
        success: true,
        insights: {
          aiAdvice: aiResponse.text,
          trending: trends,
          userProfile: {
            profileFreeText,
            skills,
            role,
            experience,
            interests,
            location
          },
          metadata: {
            articleCount,
            trendsAnalyzed: trends.length,
            generatedAt: new Date().toISOString()
          }
        }
      };

    } catch (error) {
      console.error('Insight generation failed:', error);
      throw new Error(`Insight generation failed: ${error.message}`);
    }
  }

  buildCareerPrompt({ profileFreeText = '', skills, role, experience, interests, location, trendsText }) {
    return `You are Growgle, an expert, pragmatic career coach. Produce a fully personalized, market-driven plan for any role (e.g., teacher, entrepreneur, master's student, freelancer, researcher, engineer). Optimize for time-to-outcome based on the user's profile and the newest in-demand skills.

USER NARRATIVE
- ${profileFreeText || 'Not provided'}

USER PROFILE
- Role: ${role}
- Experience: ${experience}
- Current Skills: ${skills || 'Not specified'}
- Interests: ${interests || 'Not specified'}
- Location/Preference: ${location || 'Not specified'}

MARKET SIGNALS (latest skills & trends derived from news and hiring data)
${trendsText}

GOALS
- Personalize advice to the user's role, level, and interests (works for educators, entrepreneurs, students, freelancers, and employees).
- Leverage the newest market skills explicitly (identify emerging skills and why they matter now).
- Deliver a practical, step-by-step plan with measurable outcomes and artifacts that demonstrate progress.

OUTPUT FORMAT (use Markdown headings and bullet points; no placeholders)
1) Profile Summary & Target Outcomes
  - Briefly restate the user's context and 2-3 concrete goals for the next 90 days.

2) Skills Gap & Market-Driven Skill Map (Top 5)
  - Blend user's current skills with NEW market skills seen in the signals above.
  - For each skill: why it matters now, target proficiency, and 2-3 practice actions for this month.

3) Personalized Learning Path (Weeks 1-12)
  - Weekly milestones with time estimates and concrete deliverables.
  - Include 4-6 high-quality links total (official docs, 1 course, 1 playbook/blog, 1 video, 1 practice repo).

4) Projects & Portfolio (3 projects aligned to ${role})
  - For each: one-liner, acceptance criteria, key technologies (include at least one NEW market skill), and expected artifacts/screenshots.

5) Opportunity Strategy (adapt to the role)
  - For job-seekers: titles, industries, and 5 example companies (why they fit).
  - For educators/students: programs, certifications, or institutions (why they fit).
  - For entrepreneurs/freelancers: customer segments, channels/marketplaces, or incubators (why they fit).
  - Note remote/onsite or location constraints if relevant.

6) Resume/CV, Portfolio & LinkedIn Optimization
  - 3-5 tailored bullets that quantify impact and reference market skills (resume/CV/portfolio as appropriate).
  - 3 LinkedIn headline/tagline variants aligned to the target outcomes.

7) Networking & Outreach
  - 3 specific outreach actions (communities, events, people) with a short tailored message template for ${role}.

8) Interview/Application/Pitch Prep Plan
  - 8-10 priority topics and 6 practice questions or prompts (behavioral/technical, admissions, client pitches) tied to the skill map.

9) 30/60/90 Plan & Metrics
  - Key activities, artifacts, and measurable KPIs for each phase (e.g., applications/week, course modules completed, client leads/month, prototype milestone).

10) Risks & Mitigations
  - Common blockers (time, gaps, confidence) with concrete mitigation steps.

ASSUMPTIONS
 - If any profile detail is missing, make reasonable assumptions and list them here in 2-4 bullets.

STYLE & CONSTRAINTS
- Be specific and practical; avoid generic phrasing.
- Explicitly reference 1-2 top trends by name in relevant sections.
- Use concise sentences and scannable bullets.
- Aim for 700-900 words total.`;
  }

  async getSystemStatus() {
    try {
      const status = {
        service: 'career-insights-api',
        timestamp: new Date().toISOString(),
        components: {}
      };

      // Check BigQuery connection
      try {
        const articleCount = await bigqueryClient.getArticleCount();
        status.components.bigquery = {
          status: 'healthy',
          articleCount
        };
      } catch (error) {
        status.components.bigquery = {
          status: 'error',
          error: error.message
        };
      }

      // Check NewsAPI
      try {
        const isValid = await newsApiClient.validateApiKey();
        status.components.newsapi = {
          status: isValid ? 'healthy' : 'error',
          error: !isValid ? 'Invalid API key' : undefined
        };
      } catch (error) {
        status.components.newsapi = {
          status: 'error',
          error: error.message
        };
      }

      // Check Vertex AI (basic auth check)
      try {
        await geminiClient.getAccessToken();
        status.components.vertexai = {
          status: 'healthy'
        };
      } catch (error) {
        status.components.vertexai = {
          status: 'error',
          error: error.message
        };
      }

      // Overall health
      const hasErrors = Object.values(status.components)
        .some(component => component.status === 'error');
      
      status.overall = hasErrors ? 'degraded' : 'healthy';

      return status;
    } catch (error) {
      return {
        service: 'career-insights-api',
        timestamp: new Date().toISOString(),
        overall: 'error',
        error: error.message
      };
    }
  }
}

export default new CareerInsightsService();
