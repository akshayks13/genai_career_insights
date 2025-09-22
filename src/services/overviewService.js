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
    const emergingDefaults = [
      // Core tech trends
      'ai','genai','ml','llm','nlp','cv','agentic ai',
      'cloud','serverless','edge','5g','iot','cybersecurity',
      'data engineering','data pipelines','realtime analytics','vector databases',
      'blockchain','web3','defi','smart contracts',
      'quantum','quantum algorithms',
      'robotics','autonomy','drones',
      // Domain-specific career areas
      'healthtech','digital health','medtech','bioinformatics',
      'fintech','payments','fraud detection','algo trading',
      'edtech','learning analytics','assessment',
      'climate tech','sustainability','energy storage','ev',
      'manufacturing','industry 4.0','digital twins',
      'gaming','ar','vr','metaverse',
      'govtech','civic tech','public sector',
      'legaltech','regtech','compliance',
      'ecommerce','marketplaces','logistics',
      'media','creator economy','personalization',
      'hrtech','talent analytics','future of work',
      'agritech','precision agriculture',
      'space','satellite',
      // Non-tech careers that intersect tech
      'product management','design systems','ux research',
      'data science','mle','mloPs','llmOps'
    ];
      const emergingFromUser = this.splitCsv(userEmerging).map(s => s.toLowerCase());
      const emergingFromRole = this.deriveEmergingFromRole(role);
      const emergingCandidate = (emergingFromUser.length > 0 ? emergingFromUser : [...emergingDefaults, ...emergingFromRole]);
      const emergingKeywords = Array.from(new Set(emergingCandidate)).slice(0, 30);

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
          interests,
          emerging: emergingKeywords
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

  deriveEmergingFromRole(roleRaw) {
    const role = (roleRaw || '').toLowerCase();
    const map = [
      { match: ['data scientist','ml engineer','ai engineer','mle','ds'], keywords: ['genai','llm','vector databases','mloPs','llmOps','retrieval','rag','agents'] },
      { match: ['software engineer','backend','fullstack','sre','devops'], keywords: ['cloud','serverless','edge','observability','platform engineering','rust','wasm'] },
      { match: ['frontend','ui','ux','designer'], keywords: ['design systems','web performance','accessibility','wasm','ar','vr'] },
      { match: ['product manager','pm'], keywords: ['product analytics','experimentation','growth loops','ai copilots'] },
      { match: ['security','infosec','appsec'], keywords: ['zero trust','ai security','supply chain security','sbom'] },
      { match: ['health','healthcare','biotech'], keywords: ['healthtech','digital health','bioinformatics','drug discovery ai'] },
      { match: ['finance','fintech','quant'], keywords: ['fintech','risk modeling','fraud detection','algo trading'] },
      { match: ['education','teacher','professor','edtech'], keywords: ['edtech','adaptive learning','learning analytics'] },
      { match: ['climate','sustainability','energy'], keywords: ['climate tech','grid optimization','carbon accounting','ev'] },
      { match: ['manufacturing','industrial'], keywords: ['industry 4.0','digital twins','predictive maintenance'] },
      { match: ['gov','public sector','policy'], keywords: ['govtech','civic tech','regtech'] },
    ];
    const out = new Set();
    for (const row of map) {
      if (row.match.some(m => role.includes(m))) {
        row.keywords.forEach(k => out.add(k));
      }
    }
    return Array.from(out);
  }
}

export default new OverviewService();
