import axios from 'axios';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const BASE_URL = 'https://newsapi.org/v2';

class NewsApiClient {
  constructor() {
    if (!NEWS_API_KEY) {
      console.warn('NEWS_API_KEY not found in environment variables');
    }
  }

  async fetchNews(query, options = {}) {
    try {
      if (!NEWS_API_KEY) {
        throw new Error('NewsAPI key is required');
      }

      const params = {
        q: query,
        apiKey: NEWS_API_KEY,
        pageSize: options.pageSize || 20,
        sortBy: options.sortBy || 'publishedAt',
        language: options.language || 'en',
        from: options.from || this.getDateDaysAgo(7),
        to: options.to || new Date().toISOString().split('T')[0]
      };

      // Add domains filter if provided
      if (options.domains) {
        params.domains = options.domains;
      }

      // Add sources filter if provided  
      if (options.sources) {
        params.sources = options.sources;
      }

      const response = await axios.get(`${BASE_URL}/everything`, { 
        params,
        timeout: 10000 
      });

      if (response.data.status !== 'ok') {
        throw new Error(`NewsAPI error: ${response.data.message}`);
      }

      return this.processArticles(response.data.articles, query, options);
    } catch (error) {
      console.error('Error fetching news:', error);
      throw this.handleError(error);
    }
  }

  async fetchTopHeadlines(options = {}) {
    try {
      if (!NEWS_API_KEY) {
        throw new Error('NewsAPI key is required');
      }

      const params = {
        apiKey: NEWS_API_KEY,
        pageSize: options.pageSize || 20,
        language: options.language || 'en',
        country: options.country || 'us',
        category: options.category || 'business'
      };

      const response = await axios.get(`${BASE_URL}/top-headlines`, { 
        params,
        timeout: 10000 
      });

      if (response.data.status !== 'ok') {
        throw new Error(`NewsAPI error: ${response.data.message}`);
      }

      return this.processArticles(response.data.articles, 'top-headlines', options);
    } catch (error) {
      console.error('Error fetching top headlines:', error);
      throw this.handleError(error);
    }
  }

  processArticles(articles, query, options = {}) {
    const processedArticles = articles
      .filter(article => 
        article.title && 
        article.title !== '[Removed]' && 
        article.description &&
        article.source?.name
      )
      .map((article, index) => ({
        id: `${Date.now()}_${index}`,
        title: this.cleanText(article.title),
        body: this.cleanText(article.description || article.content || ''),
        source: article.source.name,
        publishedAt: article.publishedAt,
        url: article.url,
        tags: this.extractTags(query, article, options)
      }));

    return {
      articles: processedArticles,
      totalResults: processedArticles.length,
      query: query
    };
  }

  extractTags(query, article, options = {}) {
    const includeCommon = options.includeCommonTagKeywords !== undefined ? options.includeCommonTagKeywords : true;
    const tags = new Set();

    // Add query terms as tags
    if (query && query !== 'top-headlines') {
      query.split(',').forEach(term => {
        const cleaned = term.trim().toLowerCase();
        if (cleaned) tags.add(cleaned);
      });
    }

    // Extract additional tags from title and content (optional common keywords)
    if (includeCommon) {
      const text = `${article.title} ${article.description || ''}`.toLowerCase();
      const keywords = [
        'ai', 'artificial intelligence', 'machine learning', 'ml', 'data science',
        'software engineer', 'developer', 'programming', 'coding', 'python',
        'javascript', 'react', 'nodejs', 'cloud', 'aws', 'azure', 'gcp',
        'career', 'job', 'hiring', 'salary', 'remote work', 'startup',
        'technology', 'tech', 'innovation', 'digital transformation'
      ];
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          tags.add(keyword.replace(/\s+/g, '-'));
        }
      });
    }

    return Array.from(tags);
  }

  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\\[\\+\\d+\\s+chars\\]/g, '') // Remove [+xxx chars]
      .replace(/\\s+/g, ' ')                   // Normalize whitespace
      .trim();
  }

  getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401) {
        return new Error('Invalid NewsAPI key. Please check your API key.');
      } else if (status === 429) {
        return new Error('NewsAPI rate limit exceeded. Please try again later.');
      } else if (status === 426) {
        return new Error('NewsAPI upgrade required. You may need a paid plan.');
      }
      
      return new Error(`NewsAPI error (${status}): ${data.message || error.message}`);
    } else if (error.code === 'ENOTFOUND') {
      return new Error('Network error. Check your internet connection.');
    } else if (error.code === 'ECONNABORTED') {
      return new Error('Request timeout. NewsAPI took too long to respond.');
    }
    
    return error;
  }

  // Utility method to validate API key
  async validateApiKey() {
    try {
      const response = await axios.get(`${BASE_URL}/top-headlines`, {
        params: {
          apiKey: NEWS_API_KEY,
          pageSize: 1,
          country: 'us'
        },
        timeout: 5000
      });
      
      return response.data.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}

export default new NewsApiClient();
