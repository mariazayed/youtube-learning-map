import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const apiMetricsRegistry = new Registry();
apiMetricsRegistry.setDefaultLabels({ service: 'learnmap-api' });
collectDefaultMetrics({ register: apiMetricsRegistry, prefix: 'learnmap_api_process_' });

export const httpRequestDuration = new Histogram({
  name: 'learnmap_http_request_duration_seconds',
  help: 'API request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [apiMetricsRegistry],
});

export const analysesCreated = new Counter({
  name: 'learnmap_analyses_created_total',
  help: 'New analysis records created.',
  labelNames: ['output_language'] as const,
  registers: [apiMetricsRegistry],
});

export const analysisCacheHits = new Counter({
  name: 'learnmap_analysis_cache_hits_total',
  help: 'Analysis requests served from an existing cache-key record.',
  registers: [apiMetricsRegistry],
});

export const queueDepth = new Gauge({
  name: 'learnmap_queue_jobs',
  help: 'BullMQ jobs by state.',
  labelNames: ['state'] as const,
  registers: [apiMetricsRegistry],
});

export const workerAvailable = new Gauge({
  name: 'learnmap_worker_available',
  help: 'One when a fresh worker heartbeat is visible to the API.',
  registers: [apiMetricsRegistry],
});
