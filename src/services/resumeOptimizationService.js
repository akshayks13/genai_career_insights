import geminiClient from '../vertexclient/geminiClient.js';

function looksLikeLatex(text) {
  const s = String(text || '');
  if (!s) return false;
  if (/\\documentclass\b|\\begin\{document\}|\\usepackage\b/i.test(s)) return true;
  const commands = (s.match(/\\[a-zA-Z]+\b/g) || []).length;
  return commands >= 8;
}

function stripLatexToText(latex) {
  let s = String(latex || '');
  s = s.replace(/(^|\n)\s*%.*(?=\n|$)/g, '$1');
  s = s.replace(/\\\\/g, '\n');
  s = s.replace(/\r\n/g, '\n');
  const replacers = [
    /\\(?:section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^}]*)\}/g,
    /\\textbf\{([^}]*)\}/g,
    /\\textit\{([^}]*)\}/g,
    /\\emph\{([^}]*)\}/g,
    /\\href\{[^}]*\}\{([^}]*)\}/g,
    /\\url\{([^}]*)\}/g,
  ];
  for (const re of replacers) s = s.replace(re, '$1');
  // Replace list items
  s = s.replace(/\\item\s*/g, '- ');
  // Remove environments
  s = s.replace(/\\begin\{[^}]*\}/g, '');
  s = s.replace(/\\end\{[^}]*\}/g, '');
  // Remove remaining commands like \vspace{...} or \command
  // First remove commands with optional args + one brace group (best-effort)
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(/\\[a-zA-Z*]+(?:\[[^\]]*\])?\{([^}]*)\}/g, '$1');
    if (s === before) break;
  }
  s = s.replace(/\\[a-zA-Z*]+\b/g, '');
  // Drop leftover braces
  s = s.replace(/[{}]/g, '');
  // Clean whitespace
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

function extractJsonText(rawText) {
  const raw = String(rawText || '').trim();
  if (!raw) return null;
  // Direct JSON
  if (raw.startsWith('{') && raw.endsWith('}')) return raw;
  // Fenced JSON
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  // Best-effort brace slice
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return raw.slice(firstBrace, lastBrace + 1);
  return null;
}

function cleanJsonText(candidate) {
  let s = String(candidate || '').trim();
  if (!s) return s;
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
  return s.trim();
}

function parseModelJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Empty response from model');
  const candidate = extractJsonText(raw);
  if (!candidate) throw new Error('Failed to parse model JSON');
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(cleanJsonText(candidate));
    } catch {
      throw new Error('Failed to parse model JSON');
    }
  }
}

async function getJsonFromModel({ prompt, schemaHint }) {
  const aiRaw = await geminiClient.generateContent(prompt, {
    responseMimeType: 'application/json',
    temperature: 0.35,
    maxTokens: 4000,
  });

  try {
    return { parsed: parseModelJson(aiRaw?.text), rawText: aiRaw?.text, finishReason: aiRaw?.finishReason };
  } catch {
    // Repair once
    const repairPrompt = `You are a JSON repair tool. Regenerate STRICT valid minified JSON ONLY.

JSON SCHEMA (must match exactly):
${schemaHint}

IMPORTANT RULES:
- Return ONLY a single JSON object.
- Use double quotes for all keys and string values.
- No markdown, no code fences, no comments.
- Ensure the JSON is COMPLETE (must end with a closing }).

OUTPUT TO FIX (may be truncated / may include extra text):
${String(aiRaw?.text || '').slice(0, 12000)}

Return ONLY JSON.`;
    const repaired = await geminiClient.generateContent(repairPrompt, {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxTokens: 4000,
    });
    try {
      return { parsed: parseModelJson(repaired?.text), rawText: repaired?.text, finishReason: repaired?.finishReason };
    } catch (e) {
      if (process.env.DEBUG_AI_JSON === '1') {
        console.error('ResumeOptimizationService JSON parse failed. Raw model output (first 1200 chars):', String(repaired?.text || aiRaw?.text || '').slice(0, 1200));
      }
      throw e;
    }
  }
}

class ResumeOptimizationService {
  async optimize({ resumeText, targetRole = '', jobDescription = '' } = {}) {
    const resumeRaw = String(resumeText || '').trim();
    if (!resumeRaw) throw new Error('Provide resumeText');

    const detectedFormat = looksLikeLatex(resumeRaw) ? 'latex' : 'text';
    const resume = detectedFormat === 'latex' ? stripLatexToText(resumeRaw) : resumeRaw;

    const role = String(targetRole || '').trim();
    const jd = String(jobDescription || '').trim();

    const schemaHint = `{
  "atsScore": number,
  "rationale": string,
  "topFixes": [string],
  "keywordGap": {
    "missing": [string],
    "underrepresented": [string],
    "recommendedAdditions": [
      { "keyword": string, "where": string }
    ]
  },
  "rewrittenBullets": [
    { "original": string, "improved": string }
  ],
  "skillsSection": {
    "core": [string],
    "tools": [string],
    "cloud": [string],
    "data": [string],
    "other": [string]
  },
  "formattingNotes": [string]
}`;

    const prompt = `You are an ATS resume expert. Score and improve the resume.

IMPORTANT:
- The resume content may be plain text or converted from LaTeX.
- Do NOT output LaTeX, markdown, or commentary. Output JSON only.

CONTEXT
- Target role: ${role || 'Not provided'}
- Job description provided: ${jd ? 'Yes' : 'No'}

JOB DESCRIPTION (if provided)
${jd || 'N/A'}

RESUME
${resume}

OUTPUT REQUIREMENTS
Return ONLY valid minified JSON (no markdown, no extra text). Shape:
{
  "atsScore": number, // integer 0-100
  "rationale": string,
  "topFixes": [string], // 5 items max
  "keywordGap": {
    "missing": [string],
    "underrepresented": [string],
    "recommendedAdditions": [
      { "keyword": string, "where": string }
    ]
  },
  "rewrittenBullets": [
    { "original": string, "improved": string }
  ],
  "skillsSection": {
    "core": [string],
    "tools": [string],
    "cloud": [string],
    "data": [string],
    "other": [string]
  },
  "formattingNotes": [string]
}

RULES
- If job description is provided, align keywords strongly to it.
- Do NOT invent experience; only rewrite/clarify what exists.
- Keep rewritten bullets achievement-driven, add metrics only if present or safely inferable (e.g., "reduced latency" without % if unknown).
- rewrittenBullets: MUST include 6-10 items with { "original": string, "improved": string }. Extract existing bullets from the resume and improve them.
- topFixes: MUST include 3-5 actionable items.
- skillsSection: MUST categorize ALL skills from the resume into core/tools/cloud/data/other. Do NOT leave all categories empty.
- formattingNotes: MUST include at least 2-3 items about ATS compatibility (headers, dates, special characters, columns, tables).
- atsScore: be realistic (0-100).
- ALL fields are REQUIRED. Do not return empty arrays.`;

    const { parsed, finishReason } = await getJsonFromModel({ prompt, schemaHint });

    return {
      success: true,
      result: parsed,
      finishReason,
      resumeFormatDetected: detectedFormat,
      generatedAt: new Date().toISOString(),
    };
  }
}

export default new ResumeOptimizationService();
