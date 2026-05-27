// MUST be imported before any other instrumented module (pg, graphile-worker).
// See README for the import-order contract.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK } from '@opentelemetry/sdk-node';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'seta-worker';
const traceEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
// Worker defaults to 9465 so server (9464) and worker can run side-by-side
// in local dev without port collisions. Override via OTEL_PROMETHEUS_PORT;
// set to 0 to skip binding entirely.
const metricsPort = Number(process.env.OTEL_PROMETHEUS_PORT ?? 9465);

if (!traceEndpoint) {
  process.env.OTEL_TRACES_EXPORTER ??= 'none';
}

const metricReader = metricsPort > 0 ? new PrometheusExporter({ port: metricsPort }) : undefined;

const sdk = new NodeSDK({
  serviceName,
  ...(metricReader ? { metricReader } : {}),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});
sdk.start();

const shutdown = () => {
  void sdk.shutdown();
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
