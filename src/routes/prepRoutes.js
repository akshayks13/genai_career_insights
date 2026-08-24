import express from 'express';
import resumeOptimizationService from '../services/resumeOptimizationService.js';
import jobPrepService from '../services/jobPrepService.js';
import interviewPrepService from '../services/interviewPrepService.js';

const router = express.Router();

// Resume optimization
router.post('/resume/optimize', async (req, res) => {
  try {
    const { resumeText = '', targetRole = '', jobDescription = '' } = req.body || {};
    if (!resumeText || typeof resumeText !== 'string' || !resumeText.trim()) {
      return res.status(400).json({ success: false, error: 'Provide non-empty resumeText' });
    }
    const result = await resumeOptimizationService.optimize({ resumeText, targetRole, jobDescription });
    res.json(result);
  } catch (error) {
    console.error('Resume optimize error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Job / startup prep
router.post('/job-prep', async (req, res) => {
  try {
    const { targetRole = '', currentSkills = '', experience = '', location = '', targetDuration = '', careerPath = 'job' } = req.body || {};
    if (!targetRole || typeof targetRole !== 'string' || !targetRole.trim()) {
      return res.status(400).json({ success: false, error: 'Provide non-empty targetRole' });
    }
    const result = await jobPrepService.run({ targetRole, currentSkills, experience, location, targetDuration, careerPath });
    res.json(result);
  } catch (error) {
    console.error('Job prep error:', error);
    const debug = process.env.DEBUG_AI_JSON === '1';
    const body = { success: false, error: error.message };
    if (debug && error?.rawOutputSnippet) {
      body.rawOutputSnippet = error.rawOutputSnippet;
    }
    res.status(500).json(body);
  }
});

// Interview prep from a job object
router.post('/interview-prep', async (req, res) => {
  try {
    // Accept either { job: {...} } or the job object directly.
    const body = req.body || {};
    const job = body.job && typeof body.job === 'object' ? body.job : body;
    const candidateProfile = body.candidateProfile ?? null;

    const result = await interviewPrepService.generate({ job, candidateProfile });
    res.json(result);
  } catch (error) {
    console.error('Interview prep error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
