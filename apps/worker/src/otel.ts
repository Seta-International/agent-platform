// MUST be imported before any other instrumented module (pg, graphile-worker).
// See README for the import-order contract.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK } from '@opentelemetry/sdk-node';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'seta-worker';
const metricsPort = Number(process.env.OTEL_PROMETHEUS_PORT ?? 9464);

// SDK always starts so the Prometheus /metrics endpoint is available.
// Traces are forwarded to the OTLP endpoint only when one is configured;
// when unset the SDK uses its default no-op span exporter.
const sdk = new NodeSDK({
  serviceName,
  metricReader: new PrometheusExporter({ port: metricsPort }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});
sdk.start();
process.on('SIGTERM', () => {
  void sdk.shutdown();
});
