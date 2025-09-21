import bigqueryClient from '../gcpclient/bigqueryClient.js';

class OverviewService {
  /**
   * @param {Object} prefs
   * @param {string} [prefs.role]
   * @param {string} [prefs.skills] - comma-separated
   * @param {string} [prefs.interests] - comma-separated
   * @param {number} [prefs.days] - lookback window
   * @param {number} [prefs.limit] - items per section
   */
  async getOverview(prefs = {}) {
    const days = Number(prefs.days) || 7;
    const limit = Number(prefs.limit) || 10;
    const role = (prefs.role || '').trim();
  const likedSkills = this.splitCsv(prefs.skills);
  const interests = this.splitCsv(prefs.interests);
  const userQuery = (prefs.query || '').trim();
  const userPolicy = (prefs.policy || '').trim();
  const userEmerging = (prefs.emerging || '').trim();

    // Build keyword list from skills + interests + role words
    const keywordsDerived = Array.from(new Set([
      ...likedSkills,
      ...interests,
      ...role.toLowerCase().split(/\s+/).filter(Boolean)
    ])).slice(0, 12); // cap to avoid overly long queries
    const keywordsFromUserQuery = this.splitCsv(userQuery).map(s => s.toLowerCase());
    const keywords = (keywordsFromUserQuery.length > 0 ? keywordsFromUserQuery : keywordsDerived);

    // Build policy/regulation keywords tailored to user interests and role
    const policyBase = [
      'policy','regulation','government','law',
      'visa','immigration','work permit','student visa','h1b','opt','stem opt',
      'compliance','licensing','certification','accreditation',
      'data privacy','gdpr','hipaa','ferpa',
      'export control','sanction','tariff',
      'grant','scholarship','financial aid'
    ];
    const interestTokens = interests.map(i => i.toLowerCase());
    const roleTokens = role.toLowerCase().split(/\s+/).filter(Boolean);
    const policyFromUser = this.splitCsv(userPolicy).map(s => s.toLowerCase());
    const policyKeywords = Array.from(new Set([
      ...(policyFromUser.length > 0 ? policyFromUser : []),
      ...(policyFromUser.length === 0 ? policyBase : []),
      ...(policyFromUser.length === 0 ? interestTokens : []),
      ...(policyFromUser.length === 0 ? roleTokens : [])
    ])).slice(0, 24);

    // Emerging tech keywords: prefer user-provided, else defaults
    const emergingDefaults = ['ai','genai','blockchain','quantum','edge','robotics','biotech'];
    const emergingFromUser = this.splitCsv(userEmerging).map(s => s.toLowerCase());
    const emergingKeywords = (emergingFromUser.length > 0 ? emergingFromUser : emergingDefaults);

    // Run queries in parallel where possible
    const [
      trendingGeneral,
      trendingPersonal,
      industryNewsPersonal,
      marketInsights,
      industryNewsProfile,
      govPolicies,
      emergingTech,
      sources,
      volumeByDay
    ] = await Promise.all([
      bigqueryClient.queryTopSkillsFiltered(days, limit, []),
      bigqueryClient.queryTopSkillsFiltered(days, limit, likedSkills),
      bigqueryClient.queryArticlesByKeywords(keywords, days, limit),
      bigqueryClient.queryTopSources(days, limit),
  bigqueryClient.queryArticlesByTags(likedSkills, days, Math.min(limit, 10)),
  bigqueryClient.queryArticlesByKeywords(policyKeywords, days, Math.min(limit, 10)),
  bigqueryClient.queryArticlesByKeywords(emergingKeywords, days, Math.min(limit, 10)),
      bigqueryClient.queryTopSources(days, 5),
      bigqueryClient.queryVolumeByDay(days)
    ]);

    return {
      success: true,
      period: { days },
      preferences: {
        role: role || undefined,
        skills: likedSkills,
        interests
      },
      overview: {
        trendingSkills: {
          general: trendingGeneral,
          personalized: trendingPersonal
        },
        industryNews: {
          personalized: industryNewsPersonal,
          profileRelated: industryNewsProfile
        },
        marketInsights: {
          topSources: sources,
          volumeByDay
        },
        governmentPoliciesAndRegulations: govPolicies,
        emergingTechnologies: emergingTech
      }
    };
  }

  splitCsv(value) {
    if (!value) return [];
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
}

export default new OverviewService();
