import { GoogleAuth } from 'google-auth-library';
import { VertexAI } from '@google-cloud/vertexai';

const PROJECT_ID = process.env.PROJECT_ID || process.env.GCP_PROJECT_ID;
const LOCATION = process.env.LOCATION || process.env.GCP_LOCATION || 'us-central1';
const GEN_MODEL = process.env.VERTEX_GEN_MODEL || 'gemini-2.5-flash';
const EMBED_MODEL = process.env.VERTEX_EMBED_MODEL || 'text-embedding-004';

class GeminiClient {
  constructor() {
  this.auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  this.vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const client = await this.auth.getClient();
      const token = await client.getAccessToken();
      
      this.accessToken = token.token;
      // Set expiry to 55 minutes from now (tokens typically last 1 hour)
      this.tokenExpiry = Date.now() + (55 * 60 * 1000);
      
      return this.accessToken;
    } catch (error) {
      // Detect malformed credentials JSON (common when pointing to a shell script or text file)
      if (error instanceof SyntaxError) {
        const hint = 'Credential file is not valid JSON. Ensure GOOGLE_APPLICATION_CREDENTIALS points to a service account key that starts with { and contains client_email & private_key.';
        console.error('Credentials JSON parse error:', error.message);
        throw new Error(hint);
      }
      if (error.code === 'ENOENT') {
        throw new Error('Credentials file not found at path in GOOGLE_APPLICATION_CREDENTIALS');
      }
      console.error('Error getting access token:', error.message);
      throw error;
    }
  }

  async generateContent(prompt, options = {}) {
    const candidates = this.getModelCandidates(GEN_MODEL);
    let lastErr;
    for (const modelName of candidates) {
      const model = this.vertexAI.getGenerativeModel({ model: modelName });
      const request = {
        contents: [{ role: 'user', parts: [{ text: prompt }]}],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          topP: options.topP ?? 0.8,
          topK: options.topK ?? 40,
          maxOutputTokens: options.maxTokens ?? 1024,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ]
      };

      try {
        const result = await model.generateContent(request);
        return this.parseResponse(result.response);
      } catch (error) {
        // If 404 (model not found) try next candidate
        const status = error?.code || error?.response?.status;
        if (status === 404) { lastErr = error; continue; }
        console.error('Error generating content:', error);
        throw this.handleError(error);
      }
    }
    console.error('Error generating content (model not found across candidates):', lastErr?.message);
    throw this.handleError(lastErr || new Error('Model not found'));
  }

  getModelCandidates(base) {
    const list = [];
    // Prefer exact base first
    if (base) list.push(base);
    // If unversioned, try common version
    if (base && !/-\d{3}$/.test(base)) list.push(`${base}-002`);
    // Fallbacks
    if (!list.includes('gemini-2.5-flash')) list.push('gemini-2.5-flash');
    if (!list.includes('gemini-1.5-flash-002')) list.push('gemini-1.5-flash-002');
    if (!list.includes('gemini-1.5-flash')) list.push('gemini-1.5-flash');
        return Array.from(new Set(list));
    }

  parseResponse(responseData) {
    try {
      // Handle different response structures
      if (responseData?.candidates?.length > 0) {
        const candidate = responseData.candidates[0];
        
        if (candidate?.content?.parts?.length > 0) {
          const text = candidate.content.parts
            .map(part => part.text || '')
            .join('\n')
            .trim();
          
          return {
            text,
            finishReason: candidate.finishReason,
            safetyRatings: candidate.safetyRatings,
            raw: responseData
          };
        }
      }

      // Fallback
      return {
        text: JSON.stringify(responseData),
        finishReason: 'UNKNOWN',
        safetyRatings: [],
        raw: responseData
      };
    } catch (error) {
      console.error('Error parsing response:', error);
      return {
        text: 'Error parsing AI response',
        finishReason: 'ERROR',
        safetyRatings: [],
        raw: responseData
      };
    }
  }

  async createEmbedding(text) {
    try {
      const model = this.vertexAI.getGenerativeModel({ model: EMBED_MODEL });
      // The SDK supports embeddings via embedContent
      const result = await model.embedContent({ content: { text } });
      return result;
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw this.handleError(error);
    }
  }

  handleError(error) {
    if (error.response) {
      // API responded with error status
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;
      
      if (status === 401) {
        return new Error('Authentication failed. Check your Google Cloud credentials.');
      } else if (status === 403) {
        return new Error('Permission denied. Check your Google Cloud project permissions.');
      } else if (status === 429) {
        return new Error('Rate limit exceeded. Please try again later.');
      }
      
      return new Error(`Vertex AI API error (${status}): ${message}`);
    } else if (error.code === 'ENOTFOUND') {
      return new Error('Network error. Check your internet connection.');
    } else if (error.code === 'ECONNABORTED') {
      return new Error('Request timeout. The AI service took too long to respond.');
    }
    
    return error;
  }
}

export default new GeminiClient();
