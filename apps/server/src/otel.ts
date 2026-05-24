// MUST be imported before any other instrumented module (http, pg, hono).
// See README for the import-order contract.
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NodeSDK } from '@opentelemetry/sdk-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'seta-server';

if (endpoint) {
  const sdk = new NodeSDK({
    serviceName,
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
}
