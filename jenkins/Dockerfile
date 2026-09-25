# Jenkins controller with the two tools the pipeline actually needs locally:
# Node.js (Build, Test, Code Quality) and the Docker CLI plus Compose
# (Build, Security, Deploy, Release, Monitoring).
#
# Trivy and SonarScanner are deliberately NOT installed. The pipeline runs
# Trivy as a container and SonarScanner through npx, so baking them in would
# only add download failures at image build time.

FROM jenkins/jenkins:lts

USER root

# --- Base utilities -----------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg unzip git xz-utils \
 && rm -rf /var/lib/apt/lists/*

# --- Node.js and npm ----------------------------------------------------
# Installed from the official Node.js binary tarball rather than a package
# repository. Debian's own nodejs package ships without npm, and the
# NodeSource repository is not reliably available on this base image.
ARG NODE_VERSION=18.20.8
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      -o /tmp/node.tar.xz \
 && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
 && rm /tmp/node.tar.xz \
 && node --version && npm --version

# --- Docker CLI and the Compose plugin ----------------------------------
# Only the client. It talks to Docker Desktop on the host through the socket
# mounted when this container is started.
RUN install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg \
      -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/* \
 && docker --version

USER root
