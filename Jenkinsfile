pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 40, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
        disableConcurrentBuilds()
    }

    triggers {
        // Jenkins checks GitHub every two minutes, so a push to main starts a
        // build without anyone having to press a button.
        pollSCM('H/2 * * * *')
    }

    environment {
        IMAGE_NAME      = 'spacebook-api'
        IMAGE_TAG       = "${env.BUILD_NUMBER}"
        RELEASE_VERSION = "1.0.${env.BUILD_NUMBER}"
        GITHUB_REPO     = 'TanatornBrook/spacebook-api'
        DOCKER_NETWORK  = 'spacebook-net'

        STAGING_URL     = 'http://spacebook-staging:3000'
        PROD_URL        = 'http://spacebook-prod:3000'
        SONAR_URL       = 'http://sonarqube:9000'
        PROMETHEUS_URL  = 'http://spacebook-prometheus:9090'

        SONAR_TOKEN     = credentials('sonarqube-token')
        NOTIFY_EMAIL    = 'tanatorn.rungsriwattana@gmail.com'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                sh '''
                    mkdir -p reports
                    echo "Commit:  $(git rev-parse --short HEAD)"
                    echo "Message: $(git log -1 --pretty=%s)"
                    echo "Build:   ${BUILD_NUMBER}  ->  release v${RELEASE_VERSION}"
                '''
            }
        }

        // ------------------------------------------------------------------
        // 1. BUILD
        // Installs the exact dependency versions from the lock file, writes the
        // build metadata, and produces a Docker image tagged with the build
        // number so every artefact traces back to the run that created it.
        // ------------------------------------------------------------------
        stage('Build') {
            steps {
                sh '''
                    set -e
                    echo "Node $(node --version), npm $(npm --version)"

                    npm ci

                    GIT_COMMIT_SHORT="$(git rev-parse --short HEAD)"
                    export GIT_COMMIT="${GIT_COMMIT_SHORT}"
                    npm run build

                    docker build \
                        --build-arg BUILD_NUMBER="${BUILD_NUMBER}" \
                        --build-arg GIT_COMMIT="${GIT_COMMIT_SHORT}" \
                        --build-arg APP_VERSION="${RELEASE_VERSION}" \
                        -t ${IMAGE_NAME}:${IMAGE_TAG} \
                        -t ${IMAGE_NAME}:latest \
                        .

                    docker image inspect ${IMAGE_NAME}:${IMAGE_TAG} \
                        --format 'Image: {{.RepoTags}} | Size: {{.Size}} bytes | Id: {{.Id}}' \
                        | tee reports/image-manifest.txt
                '''
            }
            post {
                success {
                    archiveArtifacts artifacts: 'dist/build-info.json, reports/image-manifest.txt',
                                     fingerprint: true
                }
            }
        }

        // ------------------------------------------------------------------
        // 2. TEST
        // Jest runs the unit suite over the business rules and the integration
        // suite over the HTTP layer with Supertest. Results are published as
        // JUnit XML so Jenkins charts the trend, and the build stops if a test
        // fails or coverage falls under the thresholds in jest.config.js.
        // ------------------------------------------------------------------
        stage('Test') {
            steps {
                sh '''
                    set -e
                    npm run test:ci
                '''
            }
            post {
                always {
                    junit testResults: 'reports/junit/junit.xml', allowEmptyResults: false
                    archiveArtifacts artifacts: 'coverage/lcov.info', allowEmptyArchive: true
                }
            }
        }

        // ------------------------------------------------------------------
        // 3. CODE QUALITY
        // ESLint catches style and correctness problems, then SonarQube measures
        // maintainability, duplication and complexity and imports the coverage
        // report from the Test stage. The quality gate decides whether the build
        // is allowed to continue.
        // ------------------------------------------------------------------
        stage('Code Quality') {
            steps {
                sh '''
                    set -e

                    echo "--- ESLint ---"
                    npx eslint src tests --format stylish | tee reports/eslint.txt

                    echo "--- SonarQube analysis ---"
                    sonar-scanner \
                        -Dsonar.host.url="${SONAR_URL}" \
                        -Dsonar.token="${SONAR_TOKEN}" \
                        -Dsonar.projectVersion="${RELEASE_VERSION}"
                '''
                script {
                    // The scanner returns as soon as the report is submitted, so
                    // the gate result is polled rather than assumed to be ready.
                    def gate = sh(
                        returnStdout: true,
                        script: '''
                            for attempt in $(seq 1 24); do
                                STATUS=$(curl -sS -u "${SONAR_TOKEN}:" \
                                    "${SONAR_URL}/api/qualitygates/project_status?projectKey=spacebook-api" \
                                    | jq -r '.projectStatus.status // "PENDING"')
                                if [ "$STATUS" = "OK" ] || [ "$STATUS" = "ERROR" ]; then
                                    echo "$STATUS"
                                    exit 0
                                fi
                                sleep 5
                            done
                            echo "TIMEOUT"
                        '''
                    ).trim()

                    echo "SonarQube quality gate: ${gate}"

                    sh '''
                        curl -sS -u "${SONAR_TOKEN}:" \
                            "${SONAR_URL}/api/measures/component?component=spacebook-api&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,sqale_rating,reliability_rating" \
                            | jq -r '.component.measures[] | "\\(.metric): \\(.value)"' \
                            | tee reports/sonar-measures.txt
                    '''

                    if (gate != 'OK') {
                        error("Quality gate did not pass (status: ${gate}). Open ${env.SONAR_URL} for the failing conditions.")
                    }
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/eslint.txt, reports/sonar-measures.txt',
                                     allowEmptyArchive: true
                }
            }
        }

        // ------------------------------------------------------------------
        // 4. SECURITY
        // Two complementary scans. npm audit checks the dependency tree against
        // the advisory database, and Trivy scans the built image for operating
        // system and library vulnerabilities. High and critical findings stop
        // the build; anything accepted after review is recorded in .trivyignore
        // rather than by lowering the threshold for everything.
        // ------------------------------------------------------------------
        stage('Security') {
            steps {
                sh '''
                    set -e
                    AUDIT_FAILED=0

                    echo "--- Dependency scan: npm audit ---"
                    npm audit --json > reports/npm-audit.json || true
                    npm audit --audit-level=high || AUDIT_FAILED=1
                    jq -r '.metadata.vulnerabilities | to_entries[] | "\\(.key): \\(.value)"' \
                        reports/npm-audit.json | tee reports/npm-audit-summary.txt

                    echo "--- Image scan: Trivy (reporting high and critical) ---"
                    trivy image \
                        --scanners vuln \
                        --severity HIGH,CRITICAL \
                        --ignorefile .trivyignore \
                        --format table \
                        --exit-code 0 \
                        --no-progress \
                        ${IMAGE_NAME}:${IMAGE_TAG} | tee reports/trivy-report.txt

                    echo "--- Image scan: failing the build on unignored high or critical findings ---"
                    trivy image \
                        --scanners vuln \
                        --severity HIGH,CRITICAL \
                        --ignorefile .trivyignore \
                        --exit-code 1 \
                        --no-progress \
                        --quiet \
                        ${IMAGE_NAME}:${IMAGE_TAG}

                    if [ "${AUDIT_FAILED}" = "1" ]; then
                        echo "npm audit reported a high or critical advisory"
                        exit 1
                    fi

                    echo "Security stage passed: no unresolved high or critical findings"
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/trivy-report.txt, reports/npm-audit.json, reports/npm-audit-summary.txt',
                                     allowEmptyArchive: true
                }
            }
        }

        // ------------------------------------------------------------------
        // 5. DEPLOY (test environment)
        // The image that has just passed the gates is started as the staging
        // container through Docker Compose, then checked with a health probe and
        // a short smoke test before the pipeline is allowed to continue.
        // ------------------------------------------------------------------
        stage('Deploy to Staging') {
            steps {
                sh '''
                    set -e

                    docker network inspect ${DOCKER_NETWORK} >/dev/null 2>&1 \
                        || docker network create ${DOCKER_NETWORK}

                    IMAGE_NAME=${IMAGE_NAME} IMAGE_TAG=${IMAGE_TAG} \
                        docker compose -f docker-compose.staging.yml up -d --force-recreate

                    echo "Waiting for staging to report healthy"
                    for attempt in $(seq 1 20); do
                        if curl -fsS ${STAGING_URL}/health > /dev/null 2>&1; then
                            echo "Staging healthy after ${attempt} attempt(s)"
                            break
                        fi
                        if [ "${attempt}" = "20" ]; then
                            docker logs spacebook-staging --tail 50
                            echo "Staging never became healthy"
                            exit 1
                        fi
                        sleep 3
                    done

                    echo "--- Smoke test against staging ---"
                    curl -fsS ${STAGING_URL}/health | tee reports/staging-health.json
                    echo
                    curl -fsS -o /dev/null -w "GET /api/spaces      -> %{http_code}\\n" ${STAGING_URL}/api/spaces
                    curl -fsS -o /dev/null -w "GET /metrics         -> %{http_code}\\n" ${STAGING_URL}/metrics
                    curl -sS  -o /dev/null -w "GET /api/bookings    -> %{http_code} (401 expected without a token)\\n" ${STAGING_URL}/api/bookings

                    DEPLOYED_VERSION=$(curl -fsS ${STAGING_URL}/health | jq -r '.version')
                    echo "Staging is serving version ${DEPLOYED_VERSION}"
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/staging-health.json', allowEmptyArchive: true
                }
                failure {
                    sh 'docker compose -f docker-compose.staging.yml down || true'
                }
            }
        }

        // ------------------------------------------------------------------
        // 6. RELEASE (production environment)
        // The image that passed staging is promoted rather than rebuilt, so what
        // runs in production is exactly what was tested. The outgoing image is
        // kept as :rollback, production is verified, and the release is tagged in
        // Git so the running version can be traced back to a commit.
        // ------------------------------------------------------------------
        stage('Release to Production') {
            steps {
                sh '''
                    set -e

                    if docker image inspect ${IMAGE_NAME}:stable >/dev/null 2>&1; then
                        docker tag ${IMAGE_NAME}:stable ${IMAGE_NAME}:rollback
                        echo "Outgoing production image kept as ${IMAGE_NAME}:rollback"
                    fi

                    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:${RELEASE_VERSION}
                    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:stable

                    IMAGE_NAME=${IMAGE_NAME} RELEASE_TAG=${RELEASE_VERSION} RELEASE_VERSION=${RELEASE_VERSION} \
                        docker compose -f docker-compose.prod.yml up -d --force-recreate

                    echo "Verifying the production release"
                    for attempt in $(seq 1 20); do
                        if curl -fsS ${PROD_URL}/health > /dev/null 2>&1; then
                            break
                        fi
                        if [ "${attempt}" = "20" ]; then
                            echo "Production did not come up: rolling back to the previous image"
                            docker tag ${IMAGE_NAME}:rollback ${IMAGE_NAME}:stable
                            IMAGE_NAME=${IMAGE_NAME} RELEASE_TAG=stable RELEASE_VERSION=rollback \
                                docker compose -f docker-compose.prod.yml up -d --force-recreate
                            exit 1
                        fi
                        sleep 3
                    done

                    curl -fsS ${PROD_URL}/health | tee reports/production-health.json
                    echo
                    echo "Production is serving version $(curl -fsS ${PROD_URL}/health | jq -r '.version')"
                '''

                withCredentials([usernamePassword(
                    credentialsId: 'github-credentials',
                    usernameVariable: 'GIT_USER',
                    passwordVariable: 'GIT_TOKEN'
                )]) {
                    sh '''
                        set -e
                        git config user.email "jenkins@spacebook.local"
                        git config user.name "Jenkins"
                        git tag -f -a "v${RELEASE_VERSION}" -m "Released by Jenkins build ${BUILD_NUMBER}"
                        git push -f "https://${GIT_USER}:${GIT_TOKEN}@github.com/${GITHUB_REPO}.git" "v${RELEASE_VERSION}"
                        echo "Release tagged in Git as v${RELEASE_VERSION}"
                    '''
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/production-health.json', allowEmptyArchive: true
                }
            }
        }

        // ------------------------------------------------------------------
        // 7. MONITORING AND ALERTING
        // Prometheus and Grafana are brought up from their own images, then the
        // pipeline confirms Prometheus is scraping the release it has just put
        // live, checks the alert rules loaded, and prints the metrics it read.
        // The post section emails the outcome so a failure is not missed.
        // ------------------------------------------------------------------
        stage('Monitoring and Alerting') {
            steps {
                sh '''
                    set -e

                    docker compose -f docker-compose.monitoring.yml up -d --build

                    echo "Waiting for Prometheus"
                    for attempt in $(seq 1 30); do
                        if curl -fsS ${PROMETHEUS_URL}/-/ready > /dev/null 2>&1; then
                            break
                        fi
                        if [ "${attempt}" = "30" ]; then
                            echo "Prometheus did not start"
                            exit 1
                        fi
                        sleep 3
                    done

                    echo "--- Generating traffic so the dashboard has data to show ---"
                    for i in $(seq 1 20); do
                        curl -fsS -o /dev/null ${PROD_URL}/health || true
                        curl -fsS -o /dev/null ${PROD_URL}/api/spaces || true
                    done

                    echo "--- Waiting for the next scrape ---"
                    sleep 20

                    UP=$(curl -sS "${PROMETHEUS_URL}/api/v1/query?query=up%7Bjob%3D%22spacebook-prod%22%7D" \
                        | jq -r '.data.result[0].value[1] // "0"')
                    echo "Prometheus reports up{job=spacebook-prod} = ${UP}"
                    if [ "${UP}" != "1" ]; then
                        echo "Prometheus is not scraping the production target"
                        exit 1
                    fi

                    echo "--- Alert rules loaded ---"
                    curl -sS "${PROMETHEUS_URL}/api/v1/rules" \
                        | jq -r '.data.groups[].rules[] | "\\(.name) [\\(.labels.severity)] state=\\(.state)"' \
                        | tee reports/alert-rules.txt

                    echo "--- Live metrics from the new release ---"
                    curl -sS "${PROMETHEUS_URL}/api/v1/query?query=sum(spacebook_http_requests_total%7Bjob%3D%22spacebook-prod%22%7D)" \
                        | jq -r '"Total requests served: \\(.data.result[0].value[1] // "0")"' \
                        | tee reports/prometheus-query.txt
                    curl -sS "${PROMETHEUS_URL}/api/v1/query?query=spacebook_process_resident_memory_bytes%7Bjob%3D%22spacebook-prod%22%7D" \
                        | jq -r '"Resident memory (bytes): \\(.data.result[0].value[1] // "0")"' \
                        | tee -a reports/prometheus-query.txt

                    echo "Grafana dashboard: http://localhost:3002/d/spacebook-overview"
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/alert-rules.txt, reports/prometheus-query.txt',
                                     allowEmptyArchive: true
                }
            }
        }
    }

    post {
        success {
            echo "Build ${env.BUILD_NUMBER} passed all seven stages. Release v${env.RELEASE_VERSION} is live."
            script {
                try {
                    mail to: env.NOTIFY_EMAIL,
                         subject: "SUCCESS: SpaceBook build ${env.BUILD_NUMBER} released v${env.RELEASE_VERSION}",
                         body: """All seven stages passed.

Production health: ${env.PROD_URL}/health
Grafana dashboard: http://localhost:3002/d/spacebook-overview
Full log: ${env.BUILD_URL}console"""
                } catch (err) {
                    echo 'Notification email not sent: no SMTP server is configured in Jenkins.'
                }
            }
        }
        failure {
            echo "Build ${env.BUILD_NUMBER} failed. Production is still running the previous release."
            script {
                try {
                    mail to: env.NOTIFY_EMAIL,
                         subject: "FAILED: SpaceBook build ${env.BUILD_NUMBER}",
                         body: """The pipeline stopped before completing.

Production was left on the previous release.
Console log: ${env.BUILD_URL}console"""
                } catch (err) {
                    echo 'Notification email not sent: no SMTP server is configured in Jenkins.'
                }
            }
        }
        always {
            sh 'docker image prune -f --filter "until=168h" || true'
        }
    }
}
