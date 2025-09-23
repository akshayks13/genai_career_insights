import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import insightsRoutes from './src/routes/insightsRoutes.js';

// Basic env validation & helpful warnings
const baseRequired = ['NEWS_API_KEY','PROJECT_ID'];
const baseMissing = baseRequired.filter(k => !process.env[k]);
if (baseMissing.length) {
  console.warn('Missing required env vars:', baseMissing.join(', '));
}

// Auth strategy detection
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.log('Auth: service account key file mode');
  console.log('   File:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
} else {
  console.log('Auth: Application Default Credentials (gcloud login)');
  console.log('Ensure you ran: gcloud auth application-default login');
}

const app = express();
const PORT = process.env.PORT || 3000;

const allowAll = (process.env.CORS_ORIGINS || '*') === '*';
const whitelist = allowAll
  ? []
  : process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

const corsOptions = {
  origin: allowAll
    ? true
    : function (origin, callback) {
        if (!origin || whitelist.includes(origin)) return callback(null, true);
        return callback(new Error('CORS: Origin not allowed'));
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', insightsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'career-insights-api'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Career Insights API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      setup: '/api/setup',
      ingestNews: 'POST /api/ingest/news',
      insights: 'GET /api/insights?skills=python,js&role=engineer'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
