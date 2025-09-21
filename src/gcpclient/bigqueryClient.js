import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.PROJECT_ID;
const DATASET = process.env.BQ_DATASET || 'career_insights';
const NEWS_TABLE = process.env.BQ_NEWS_TABLE || 'news_articles';

class BigQueryClient {
  constructor() {
    this.bigquery = null;
  }

  initClient() {
    if (!this.bigquery) {
      this.bigquery = new BigQuery({ projectId: PROJECT_ID });
    }
    return this.bigquery;
  }

  async createDatasetAndTable() {
    try {
      const bq = this.initClient();
      const dataset = bq.dataset(DATASET);

      // Create dataset if it doesn't exist
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        await dataset.create();
        console.log(`📊 Dataset ${DATASET} created`);
      }

      // Create table if it doesn't exist
      const table = dataset.table(NEWS_TABLE);
      const [tableExists] = await table.exists();

      if (!tableExists) {
        const schema = [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'title', type: 'STRING', mode: 'REQUIRED' },
          { name: 'body', type: 'STRING', mode: 'NULLABLE' },
          { name: 'source', type: 'STRING', mode: 'NULLABLE' },
          { name: 'published_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'tags', type: 'STRING', mode: 'REPEATED' },
          { name: 'ingested_at', type: 'TIMESTAMP', mode: 'NULLABLE', defaultValueExpression: 'CURRENT_TIMESTAMP()' }
        ];

        await table.create({ schema });
        console.log(`📋 Table ${NEWS_TABLE} created with schema`);
      }

      return { dataset: DATASET, table: NEWS_TABLE, created: !tableExists };
    } catch (error) {
      console.error('Error creating dataset/table:', error);
      throw error;
    }
  }

  async insertNewsArticles(articles) {
    try {
      const bq = this.initClient();
      const table = bq.dataset(DATASET).table(NEWS_TABLE);

      const rows = articles.map(article => ({
        id: article.id,
        title: article.title,
        body: article.body,
        source: article.source,
        published_at: article.publishedAt ? new Date(article.publishedAt) : new Date(),
        tags: article.tags || [],
        ingested_at: new Date()
      }));

      const insertOptions = {
        ignoreUnknownValues: false,
        skipInvalidRows: false,
        createInsertId: false
      };

      await table.insert(rows, insertOptions);
      console.log(`Inserted ${rows.length} articles into ${DATASET}.${NEWS_TABLE}`);
      
      return rows.length;
    } catch (error) {
      console.error('Error inserting articles:', error);
      throw error;
    }
  }

  async queryTopTrends(daysPast = 7) {
    try {
      const bq = this.initClient();
      
      const sql = `
        SELECT skill, COUNT(*) as mentions
        FROM \`${PROJECT_ID}.${DATASET}.${NEWS_TABLE}\`, 
        UNNEST(tags) as skill
        WHERE DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @daysPast DAY)
        GROUP BY skill
        ORDER BY mentions DESC
        LIMIT 10
      `;

      const options = {
        query: sql,
        params: { daysPast },
        types: { daysPast: 'INT64' }
      };

      const [job] = await bq.createQueryJob(options);
      const [rows] = await job.getQueryResults();
      
      return rows;
    } catch (error) {
      console.error('Error querying trends:', error);
      throw error;
    }
  }

  async getArticleCount() {
    try {
      const bq = this.initClient();
      const sql = `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.${DATASET}.${NEWS_TABLE}\``;
      
      const [job] = await bq.createQueryJob({ query: sql });
      const [rows] = await job.getQueryResults();
      
      return rows[0]?.count || 0;
    } catch (error) {
      console.error('Error getting article count:', error);
      throw error;
    }
  }

  // Top skills (optionally filtered by a list of liked skills)
  async queryTopSkillsFiltered(daysPast = 7, limit = 10, likedSkills = []) {
    try {
      const bq = this.initClient();
      const filterByLikes = Array.isArray(likedSkills) && likedSkills.length > 0;

      const sql = `
        SELECT skill, COUNT(*) as mentions
        FROM \`${PROJECT_ID}.${DATASET}.${NEWS_TABLE}\`, UNNEST(tags) as skill
        WHERE DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @daysPast DAY)
        ${filterByLikes ? 'AND LOWER(skill) IN UNNEST(@likedSkills)' : ''}
        GROUP BY skill
        ORDER BY mentions DESC
        LIMIT @limit
      `;

      const options = {
        query: sql,
        params: {
          daysPast,
          limit,
          ...(filterByLikes ? { likedSkills: likedSkills.map(s => s.toLowerCase()) } : {})
        },
        types: { daysPast: 'INT64', limit: 'INT64' }
      };

      const [job] = await bq.createQueryJob(options);
      const [rows] = await job.getQueryResults();
      return rows;
    } catch (error) {
      console.error('Error querying top skills filtered:', error);
      throw error;
    }
  }

  // Get recent articles that match any of the provided tags
  async queryArticlesByTags(tags = [], daysPast = 7, limit = 10) {
    if (!Array.isArray(tags)) tags = [];
    try {
      const bq = this.initClient();
      const hasTags = tags.length > 0;

      const sql = `
        WITH filtered AS (
          SELECT id, title, body, source, published_at, tags
          FROM \`${PROJECT_ID}.${DATASET}.${NEWS_TABLE}\`
          WHERE DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @daysPast DAY)
        )
        SELECT id, title, body, source, published_at, tags
        FROM filtered, UNNEST(tags) AS tag
        ${hasTags ? 'WHERE LOWER(tag) IN UNNEST(@tags)' : ''}
        QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY published_at DESC) = 1
        ORDER BY published_at DESC
        LIMIT @limit
      `;

      const options = {
        query: sql,
        params: {
          daysPast,
          limit,
          ...(hasTags ? { tags: tags.map(t => t.toLowerCase()) } : {})
        },
        types: { daysPast: 'INT64', limit: 'INT64' }
      };

      const [job] = await bq.createQueryJob(options);
      const [rows] = await job.getQueryResults();
      return rows;
    } catch (error) {
      console.error('Error querying articles by tags:', error);
      throw error;
    }
  }

  // Get recent articles that match any of the provided keywords in title or body
  async queryArticlesByKeywords(keywords = [], daysPast = 7, limit = 10) {
    if (!Array.isArray(keywords)) keywords = [];
    try {
      const bq = this.initClient();
      const hasKw = keywords.length > 0;

      const sql = `
        SELECT id, title, body, source, published_at, tags
        FROM \`${PROJECT_ID}.${DATASET}.${NEWS_TABLE}\`
        WHERE DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @daysPast DAY)
        ${hasKw ? 'AND EXISTS (SELECT 1 FROM UNNEST(@keywords) kw WHERE STRPOS(LOWER(title), kw) > 0 OR STRPOS(LOWER(body), kw) > 0)' : ''}
        ORDER BY published_at DESC
        LIMIT @limit
      `;

      const options = {
        query: sql,
        params: {
          daysPast,
          limit,
          ...(hasKw ? { keywords: keywords.map(k => k.toLowerCase()) } : {})
        },
        types: { daysPast: 'INT64', limit: 'INT64' }
      };

      const [job] = await bq.createQueryJob(options);
      const [rows] = await job.getQueryResults();
      return rows;
    } catch (error) {
      console.error('Error querying articles by keywords:', error);
      throw error;
    }
  }

  // Top sources in the period
  async queryTopSources(daysPast = 7, limit = 10) {
    try {
      const bq = this.initClient();
      const sql = `
        SELECT source, COUNT(*) as count
        FROM \`${PROJECT_ID}.${DATASET}.${NEWS_TABLE}\`
        WHERE DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @daysPast DAY)
        GROUP BY source
        ORDER BY count DESC
        LIMIT @limit
      `;

      const [job] = await bq.createQueryJob({
        query: sql,
        params: { daysPast, limit },
        types: { daysPast: 'INT64', limit: 'INT64' }
      });
      const [rows] = await job.getQueryResults();
      return rows;
    } catch (error) {
      console.error('Error querying top sources:', error);
      throw error;
    }
  }

  // Volume by day for the given window
  async queryVolumeByDay(daysPast = 7) {
    try {
      const bq = this.initClient();
      const sql = `
        SELECT DATE(published_at) AS day, COUNT(*) AS count
        FROM \`${PROJECT_ID}.${DATASET}.${NEWS_TABLE}\`
        WHERE DATE(published_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL @daysPast DAY)
        GROUP BY day
        ORDER BY day
      `;

      const [job] = await bq.createQueryJob({ query: sql, params: { daysPast }, types: { daysPast: 'INT64' } });
      const [rows] = await job.getQueryResults();
      return rows;
    } catch (error) {
      console.error('Error querying volume by day:', error);
      throw error;
    }
  }
}

export default new BigQueryClient();
