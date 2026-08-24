import careerInsightsService from './careerInsightsService.js';
import geminiClient from '../vertexclient/geminiClient.js';

class RagIntelligenceService {
  async explore({ question = '', profile = {}, includeTrending = true } = {}) {
    const started = Date.now();
    const q = String(question || '').trim();
    if (!q) throw new Error('Provide a non-empty question');

    const mergedProfile = {
      profileFreeText: profile.profileFreeText || '',
      role: profile.role || 'professional',
      skills: profile.skills || '',
      experience: profile.experience || 'mid-level',
      interests: profile.interests || '',
      location: profile.location || ''
    };

    let careerData;
    try {
      careerData = await careerInsightsService.generateCareerInsights(mergedProfile);
    } catch (err) {
      careerData = { success: false, error: err?.message || String(err) };
    }

    const geoBase = (process.env.GEO_DATA_API_URL || '').replace(/\/$/, '');
    const geoTimeoutMs = Number(process.env.GEO_QUERY_TIMEOUT_MS || 45000);

    let geoPayload = null;
    let geoError = null;

    if (!geoBase) {
      geoError = 'GEO_DATA_API_URL not configured';
    } else {
      let timeoutId;
      try {
        let controller;
        if (geoTimeoutMs > 0) {
          controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), geoTimeoutMs);
        }

        const resp = await fetch(`${geoBase}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
          signal: controller ? controller.signal : undefined
        });

        const ct = resp.headers.get('content-type') || '';
        const text = await resp.text();

        if (!resp.ok) {
          geoError = `Geo API ${resp.status}`;
        }

        try {
          geoPayload = ct.includes('application/json') ? JSON.parse(text) : { raw: text };
        } catch {
          geoPayload = { raw: text };
        }
      } catch (geoErrInner) {
        if (geoErrInner?.name === 'AbortError') {
          geoError = `Geo API timeout after ${geoTimeoutMs}ms (set GEO_QUERY_TIMEOUT_MS to adjust or 0 for no timeout)`;
        } else {
          geoError = geoErrInner?.message || String(geoErrInner);
        }
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    const careerAdvice = careerData?.insights?.aiAdvice || 'No career insights available.';
    const trending = includeTrending ? (careerData?.insights?.trending || []) : [];

    const consolidationPrompt = `You are a senior career adviser.

INTENT CHECK:
- If the QUESTION is a greeting or not a specific query (for example, fewer than ~6 words and no clear ask), return a very short plain-text guidance message (2-4 lines) and STOP.

Otherwise, produce ONE unified, cohesive plain-text answer that blends all available signals.

QUESTION: ${q}

CAREER INSIGHTS (market & skill guidance):
${String(careerAdvice).substring(0, 6000)}

GEO/POLICY RESPONSE RAW:
${geoError ? '[Unavailable: ' + geoError + ']' : JSON.stringify(geoPayload).substring(0, 6000)}

TOP TRENDING SKILLS:
${trending.slice(0, 10).map((t) => `${t.skill} (${t.mentions})`).join(', ') || 'None'}

INSTRUCTIONS:
- Return ONLY a single consolidated answer (no headings, no bullet lists, no numbering).
- Weave together market signals, geo/policy context, risks, mitigations, and 5-8 concrete recommendations inline.
- If geo/policy data is missing, acknowledge briefly once and continue with what is known.
- Focus on specifics for India where relevant without overgeneralizing.
- Avoid filler, self-reference, disclaimers, markdown, bullets, or section titles.`;

    const gen = await geminiClient.generateContent(consolidationPrompt, { temperature: 0.45 });
    const answer = gen?.text || '';

    return {
      success: true,
      question: q,
      answer,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      geo: { success: !geoError, error: geoError || undefined },
      career: { success: !!careerData?.success, trendingCount: trending.length }
    };
  }
}

export default new RagIntelligenceService();
