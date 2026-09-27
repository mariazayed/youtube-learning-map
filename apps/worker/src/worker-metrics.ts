import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const workerMetricsRegistry = new Registry();
workerMetricsRegistry.setDefaultLabels({ service: 'learnmap-worker' });
collectDefaultMetrics({
  register: workerMetricsRegistry,
  prefix: 'learnmap_worker_process_',
});

export const analysisOutcomes = new Counter({
  name: 'learnmap_analysis_outcomes_total',
  help: 'Worker analysis outcomes.',
  labelNames: ['status', 'provider', 'model', 'error_code'] as const,
  registers: [workerMetricsRegistry],
});

export const analysisProcessingDuration = new Histogram({
  name: 'learnmap_analysis_processing_duration_seconds',
  help: 'End-to-end worker attempt duration.',
  labelNames: ['status'] as const,
  buckets: [1, 5, 15, 30, 60, 120, 300, 600, 900],
  registers: [workerMetricsRegistry],
});

export const providerErrors = new Counter({
  name: 'learnmap_ai_provider_errors_total',
  help: 'AI provider failures by stable error code.',
  labelNames: ['provider', 'model', 'error_code', 'retryable'] as const,
  registers: [workerMetricsRegistry],
});

export const validationFailures = new Counter({
  name: 'learnmap_ai_validation_failures_total',
  help: 'AI responses rejected by schema or graph validation.',
  registers: [workerMetricsRegistry],
});

export const estimatedAnalysisCost = new Histogram({
  name: 'learnmap_analysis_estimated_cost_usd',
  help: 'Estimated provider cost per completed analysis in USD; not a billing record.',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [workerMetricsRegistry],
});

export const workerUp = new Gauge({
  name: 'learnmap_worker_up',
  help: 'One while this worker process is ready.',
  registers: [workerMetricsRegistry],
});

export const workerHeartbeatTimestamp = new Gauge({
  name: 'learnmap_worker_heartbeat_timestamp_seconds',
  help: 'Unix timestamp of this process latest successful Redis heartbeat.',
  registers: [workerMetricsRegistry],
});
