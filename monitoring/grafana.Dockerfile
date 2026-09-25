# Grafana with the Prometheus data source and the SpaceBook dashboard already
# provisioned, so the dashboard is available the first time the stack starts.
FROM grafana/grafana:11.1.0

COPY grafana/provisioning /etc/grafana/provisioning
COPY grafana/dashboards /var/lib/grafana/dashboards
