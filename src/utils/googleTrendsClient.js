import googleTrends from 'google-trends-api';

class GoogleTrendsClient {
  async getSnapshot(keywords = [], { timeRange = 'now 7-d', geo = '' } = {}) {
    const terms = Array.from(new Set((keywords || [])
      .flatMap(k => (k || '').split(',').map(s => s.trim()))
      .filter(Boolean)));
    if (terms.length === 0) return { terms: [], interestOverTime: [], relatedQueries: [], timeframe: timeRange };

    const settled = await Promise.allSettled(terms.map(async term => {
      const [iotRaw, rqRaw] = await Promise.all([
        googleTrends.interestOverTime({ keyword: term, timeframe: timeRange, geo }),
        googleTrends.relatedQueries({ keyword: term, timeframe: timeRange, geo })
      ]);
      return { term, iot: JSON.parse(iotRaw), rq: JSON.parse(rqRaw) };
    }));

    const iotSeries = [];
    const related = [];
    for (const r of settled) {
      if (r.status !== 'fulfilled') continue;
      const { term, iot, rq } = r.value;
      const timeline = iot?.default?.timelineData || [];
      iotSeries.push({ term, points: timeline.map(p => ({ time: p.formattedTime || p.time, value: Number(p.value?.[0] || 0) })) });
      const top = rq?.default?.rankedList?.[0]?.rankedKeyword || [];
      related.push({ term, queries: top.slice(0, 10).map(q => ({ query: q.query, value: q.value })) });
    }

    return { terms, interestOverTime: iotSeries, relatedQueries: related, timeframe: timeRange };
  }
}

export default new GoogleTrendsClient();
