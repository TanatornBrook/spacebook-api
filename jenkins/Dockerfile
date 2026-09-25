# A Jenkins controller that already contains every tool the pipeline needs.
#
# Building the controller from a Dockerfile rather than installing tools by hand
# means the whole environment is versioned alongside the project, and it can be
# rebuilt from scratch if the container is ever lost.

FROM jenkins/jenkins:lts

USER root

ARG NODE_MAJOR=18
ARG TRIVY_VERSION=0.53.0
ARG SONAR_SCANNER_VERSION=5.0.1.3006

# --- Base utilities -----------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg unzip jq git \
 && rm -rf /var/lib/apt/lists/*

# --- Node.js and npm (Build and Test stages) ----------------------------
RUN mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# --- Docker CLI and the Compose plugin (Build, Deploy, Release stages) --
# Only the client is installed. It talks to Docker Desktop on the host through
# the socket that is mounted when this container is started.
RUN install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg \
      -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/*

# --- Trivy (Security stage) ---------------------------------------------
RUN curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
      -o /tmp/trivy.tar.gz \
 && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
 && rm /tmp/trivy.tar.gz \
 && trivy --version

# --- SonarScanner CLI (Code Quality stage) ------------------------------
RUN curl -fsSL "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}-linux.zip" \
      -o /tmp/sonar-scanner.zip \
 && unzip -q /tmp/sonar-scanner.zip -d /opt \
 && mv "/opt/sonar-scanner-${SONAR_SCANNER_VERSION}-linux" /opt/sonar-scanner \
 && ln -s /opt/sonar-scanner/bin/sonar-scanner /usr/local/bin/sonar-scanner \
 && rm /tmp/sonar-scanner.zip

ENV TRIVY_CACHE_DIR=/var/jenkins_home/.cache/trivy \
    PATH="/opt/sonar-scanner/bin:${PATH}"

# Jenkins keeps running as root so it can reach the mounted Docker socket
# without having to match the host's docker group id.
USER root
