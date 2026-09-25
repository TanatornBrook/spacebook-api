# Prometheus with the SpaceBook scrape configuration and alert rules baked in.
# Building the config into the image keeps the monitoring stack reproducible and
# avoids bind mounts, which do not resolve correctly when Docker commands are
# issued from inside the Jenkins container.
FROM prom/prometheus:v2.53.0

COPY prometheus.yml /etc/prometheus/prometheus.yml
COPY alert.rules.yml /etc/prometheus/alert.rules.yml
