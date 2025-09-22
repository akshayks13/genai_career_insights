import geminiClient from '../vertexclient/geminiClient.js';

class SynthesisService {
  /**
   * Combine two text sources (real-time insights and government dataset insights)
   * into a single, user-friendly report.
   *
   * @param {Object} params
   * @param {string} params.realTimeText - Free text from real-time career insights
   * @param {string} params.governmentText - Free text from government dataset insights
   * @param {string} [params.role] - Optional role to tailor guidance
   * @param {string} [params.question] - Optional user question to steer the summary
   */
  async synthesize({ realTimeText = '', governmentText = '', role = '', question = '', detail = 'standard' } = {}) {
    if (!realTimeText && !governmentText) {
      throw new Error('Provide at least one of realTimeText or governmentText');
    }

    const prompt = this.buildPrompt({ realTimeText, governmentText, role, question, detail });

    // Low temperature for crisp synthesis. Adjust token budget by detail.
    const tokenBudget = detail === 'short' ? 800 : detail === 'long' ? 2048 : 1400;
    const ai = await geminiClient.generateContent(prompt, {
      temperature: 0.3,
      maxTokens: tokenBudget
    });

    return {
      success: true,
      synthesis: {
        role: role || undefined,
        question: question || undefined,
        reportMarkdown: ai.text,
        finishReason: ai.finishReason
      },
      inputs: {
        realTimeTextLength: (realTimeText || '').length,
        governmentTextLength: (governmentText || '').length
      },
      metadata: {
        generatedAt: new Date().toISOString()
      }
    };
  }

  buildPrompt({ realTimeText, governmentText, role, question, detail }) {
    const lengthHint = detail === 'short' ? '450-650 words' : detail === 'long' ? '800-1100 words' : '600-850 words';
  return `You are Growgle, act as a pragmatic career coach and policy analyst. Synthesize the two inputs into a single, accessible report for a general audience. Avoid jargon. Be specific. Do not self-reference or include phrases like "As Growgle".

CONTEXT (real-time career insights)
${realTimeText || 'Not provided'}

CONTEXT (government dataset insights)
${governmentText || 'Not provided'}

USER CONTEXT
- Role (optional): ${role || 'N/A'}
- Question (optional): ${question || 'N/A'}

REQUIREMENTS
- Cap total length to ${lengthHint} to prevent truncation.
- Produce a succinct executive summary (4-5 bullets).
- Reconcile differences or conflicts between the two sources.
- Provide a combined, prioritized action plan (5-6 bullets) tailored to the role if provided.
- Call out relevant policies/regulations if present (plain language).
- Include a short risks & mitigations list (3 items max).
- Finish with a concise checklist and recommended next steps (6-8 items, one-liners).

FORMAT
Return Markdown with clear headings:
1) Executive Summary
2) What the Data Says (Converging + Conflicting Signals)
3) Combined Action Plan
4) Policies & Constraints (Plain Language)
5) Risks & Mitigations
6) Next Steps Checklist
`;
  }
}

export default new SynthesisService();
