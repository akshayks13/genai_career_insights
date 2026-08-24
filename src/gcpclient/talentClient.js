import { JobServiceClient, CompanyServiceClient } from '@google-cloud/talent';

const PROJECT_ID = process.env.PROJECT_ID;
const TENANT_ID = process.env.TALENT_TENANT_ID; // optional

function getParent() {
  if (!PROJECT_ID) throw new Error('PROJECT_ID env is required for Talent API');
  return TENANT_ID
    ? `projects/${PROJECT_ID}/tenants/${TENANT_ID}`
    : `projects/${PROJECT_ID}`;
}

class TalentClient {
  constructor() {
    this.jobClient = new JobServiceClient();
    this.companyClient = new CompanyServiceClient();
  }

  async createCompany(displayName, externalId) {
    const parent = getParent();
    const ext = externalId || displayName.replace(/\s+/g, '-').toLowerCase();

    // Try to reuse if externalId already exists
    try {
      const extSafe = String(ext).replace(/"/g, '');
      const [companies] = await this.companyClient.listCompanies({ parent, filter: `externalId = "${extSafe}"` });
      if (Array.isArray(companies) && companies.length > 0 && companies[0].name) {
        return companies[0].name;
      }
    } catch (_) { /* ignore */ }

    const [company] = await this.companyClient.createCompany({
      parent,
      company: { displayName, externalId: ext }
    });
    return company.name;
  }

  async createJob(jobData) {
    const parent = getParent();
    const companyName = await this.createCompany(jobData.company_name || jobData.company || 'Company');
    const mapEmployment = (t) => {
      const v = String(t || '').toUpperCase();
      if (['FULL_TIME','PART_TIME','CONTRACTOR','TEMPORARY','INTERN','VOLUNTEER','PER_DIEM','OTHER'].includes(v)) return v;
      if (v.includes('FULL')) return 'FULL_TIME';
      if (v.includes('PART')) return 'PART_TIME';
      if (v.includes('CONTRACT')) return 'CONTRACTOR';
      if (v.includes('TEMP')) return 'TEMPORARY';
      if (v.includes('INTERN')) return 'INTERN';
      return 'OTHER';
    };
    const job = {
      title: jobData.title,
      company: companyName,
      description: jobData.description || '',
      applicationInfo: jobData.apply_link ? { uris: [jobData.apply_link] } : undefined,
      addresses: jobData.location ? [jobData.location] : [],
      employmentTypes: jobData.employment_type ? [mapEmployment(jobData.employment_type)] : [],
      requisitionId: String(jobData.job_id || Date.now())
    };
    const [created] = await this.jobClient.createJob({ parent, job });
    return created;
  }

  async searchJobs({ query = '', location = '', userId = 'user-unknown', domain = 'career-insights.app', pageSize = 10 } = {}) {
    const parent = getParent();
    const request = {
      parent,
      requestMetadata: { userId, domain },
      jobQuery: {
        query,
        ...(location ? { locationFilters: [{ address: location }] } : {})
      },
      searchMode: 'JOB_SEARCH',
      // Use FULL view so response contains companyDisplayName and richer fields
      jobView: 'JOB_VIEW_FULL',
      pageSize
    };
    const [response] = await this.jobClient.searchJobs(request);
    return response.matchingJobs || [];
  }

  async getCompanyDisplayName(name) {
    if (!name) return '';
    try {
      const [company] = await this.companyClient.getCompany({ name });
      return company?.displayName || '';
    } catch (_) {
      return '';
    }
  }
}

export default new TalentClient();
