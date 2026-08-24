import jobsBigQueryClient from '../gcpclient/jobsBigQueryClient.js';
import talentClient from '../gcpclient/talentClient.js';

// Fetch jobs from RapidAPI jsearch and insert to BigQuery
export async function fetchAndIngestRapidJobs({ query = 'software engineer in india', page = 1 } = {}) {
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY env missing');

  const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&page=${page}`;
  const resp = await fetch(url, {
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': 'jsearch.p.rapidapi.com'
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`RapidAPI jsearch ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const rows = Array.isArray(data?.data) ? data.data.map(job => ({
    job_id: job.job_id,
    title: job.job_title,
    company_name: job.employer_name,
    location: job.job_city || job.job_country || job.job_state,
    employment_type: job.job_employment_type,
    description: job.job_description,
    apply_link: job.job_apply_link
  })) : [];

  await jobsBigQueryClient.ensureDatasetAndTable();
  const inserted = await jobsBigQueryClient.insertJobs(rows);

  // Also publish each job to Google Talent immediately (no separate sync route)
  let created = 0, exists = 0, failed = 0;
  const results = [];
  for (const r of rows) {
    const payload = {
      job_id: r.job_id,
      title: r.title,
      company_name: r.company_name,
      description: r.description,
      apply_link: r.apply_link,
      location: r.location,
      employment_type: r.employment_type
    };
    try {
      const createdJob = await talentClient.createJob(payload);
      created++;
      results.push({ ok: true, name: createdJob.name, requisitionId: createdJob.requisitionId });
    } catch (e) {
      const msg = String(e.message || e);
      // Treat duplicates as non-fatal "exists"
      if (e.code === 6 || /already_exists|ALREADY_EXISTS/i.test(msg)) {
        exists++;
        results.push({ ok: true, exists: true, job_id: payload.job_id });
      } else {
        failed++;
        results.push({ ok: false, error: msg, job_id: payload.job_id });
      }
    }
  }

  return {
    count: inserted,
    talent: { created, exists, failed, total: created + exists + failed, results }
  };
}

export async function talentCreateCompany({ displayName, externalId }) {
  if (!displayName) throw new Error('displayName required');
  const name = await talentClient.createCompany(displayName, externalId);
  return { name };
}

export async function talentCreateJob(jobData) {
  const created = await talentClient.createJob(jobData);
  return { name: created.name, requisitionId: created.requisitionId };
}

export async function talentSearchJobs(params) {
  const matches = await talentClient.searchJobs(params);
  // Try to enrich missing company display names by fetching companies
  const needLookup = new Set();
  for (const m of matches) {
    if (!m?.job?.companyDisplayName && m?.job?.company) needLookup.add(m.job.company);
  }
  const lookupNames = Array.from(needLookup).slice(0, 20); // cap lookups for performance
  const nameMap = new Map();
  await Promise.all(
    lookupNames.map(async (n) => {
      const dn = await talentClient.getCompanyDisplayName(n);
      if (dn) nameMap.set(n, dn);
    })
  );

  // Normalize down to core fields
  return matches.map(m => {
    const resource = m?.job?.company || '';
    const display = m?.job?.companyDisplayName || nameMap.get(resource) || (resource ? resource.split('/').pop() : '');
    return {
      title: m?.job?.title,
      company: display,
      location: m?.job?.addresses?.[0] || '',
      employmentTypes: m?.job?.employmentTypes || [],
      name: m?.job?.name
    };
  });
}

// Sync jobs stored in BigQuery into Google Talent (create companies+jobs)
export async function syncBqToTalent({ limit = 50, since, dryRun = false } = {}) {
  await jobsBigQueryClient.ensureDatasetAndTable();
  const rows = await jobsBigQueryClient.fetchJobsForSync({ limit, since });
  const unique = new Map();
  for (const r of rows) {
    const key = r.job_id || `${r.title}|${r.company_name}`;
    if (!unique.has(key)) unique.set(key, r);
  }
  const items = Array.from(unique.values());

  const results = [];
  for (const job of items) {
    const payload = {
      job_id: job.job_id,
      title: job.title,
      company_name: job.company_name || 'Company',
      description: job.description || '',
      apply_link: job.apply_link || '',
      location: job.location || '',
      employment_type: job.employment_type || ''
    };
    if (dryRun) {
      results.push({ ok: true, dryRun: true, job_id: payload.job_id });
      continue;
    }
    try {
      const created = await talentClient.createJob(payload);
      results.push({ ok: true, name: created.name, requisitionId: created.requisitionId });
    } catch (e) {
      results.push({ ok: false, error: e.message, job_id: payload.job_id });
    }
  }
  const summary = {
    requested: items.length,
    success: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length
  };
  return { summary, results };
}

// BigQuery: fetch latest N jobs (ordered by ingested_at DESC)
export async function bqFetchLatestJobs({ limit = 50 } = {}) {
  await jobsBigQueryClient.ensureDatasetAndTable();
  const rows = await jobsBigQueryClient.fetchJobsForSync({ limit: Number(limit) || 50 });
  return rows;
}

// BigQuery: search ingested jobs by query/location
export async function bqSearchIngestedJobs({ query = '', location = '', limit = 20 } = {}) {
  await jobsBigQueryClient.ensureDatasetAndTable();
  const rows = await jobsBigQueryClient.searchJobs({ query, location, limit: Number(limit) || 20 });
  return rows;
}

export default {
  fetchAndIngestRapidJobs,
  talentCreateCompany,
  talentCreateJob,
  talentSearchJobs,
  syncBqToTalent,
  bqSearchIngestedJobs
};
