// ECS Fargate sidecar — metrics only (logs travel FireLens → Loki, see ecs.tf).
// instance is the bare container name, distinct from the compose boxes'
// "<name>:9464" so a cutover overlap never collides in remote_write.
prometheus.scrape "app" {
  targets      = [{ __address__ = "localhost:9464", instance = "${container}" }]
  metrics_path = "/metrics"
  forward_to   = [prometheus.remote_write.central.receiver]
}

prometheus.remote_write "central" {
  external_labels = { env = sys.env("MONITORING_ENV") }
  endpoint {
    url = sys.env("REMOTE_WRITE_URL")
    basic_auth {
      username = sys.env("REMOTE_WRITE_USERNAME")
      password = sys.env("REMOTE_WRITE_PASSWORD")
    }
  }
}
