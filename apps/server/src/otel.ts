// MUST be imported before any other instrumented module (http, pg, hono).
// See README for the import-order contract.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK } from '@opentelemetry/sdk-node';

const serviceName = process.env.OTEL_SERVICE_NAME ?? 'seta-server';
const traceEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const metricsPort = Number(process.env.OTEL_PROMETHEUS_PORT ?? 9464);

// NodeSDK defaults OTEL_TRACES_EXPORTER to 'otlp' (→ localhost:4318) when a
// tracer provider is auto-installed. Without an endpoint configured that turns
// into a tight loop of connection-refused errors. Force 'none' so traces are
// dropped silently until an endpoint is set.
if (!traceEndpoint) {
  process.env.OTEL_TRACES_EXPORTER ??= 'none';
}

// Set OTEL_PROMETHEUS_PORT=0 to skip binding the /metrics listener entirely
// (useful in tests and for processes that don't want the port held).
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
