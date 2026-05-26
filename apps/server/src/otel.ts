// MUST be imported before any other instrumented module (http, pg, hono).
// See README for the import-order contract.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK } from '@opentelemetry/sdk-node';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'seta-server';
const metricsPort = Number(process.env.OTEL_PROMETHEUS_PORT ?? 9464);

// SDK always starts so the Prometheus /metrics endpoint is available.
// When OTEL_EXPORTER_OTLP_ENDPOINT is set, the SDK auto-configures the OTLP
// trace exporter from the environment; when unset, spans are dropped locally.
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
