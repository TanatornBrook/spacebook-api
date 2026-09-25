pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 40, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
        disableConcurrentBuilds()
    }

    triggers {
        pollSCM('H/2 * * * *')
    }

    environment {
        IMAGE_NAME      = 'spacebook-api'
        IMAGE_TAG       = "${env.BUILD_NUMBER}"
        RELEASE_VERSION = "1.0.${env.BUILD_NUMBER}"
        GITHUB_REPO     = 'TanatornBrook/spacebook-api'

        // Jenkins reaches every other container through the host, which is the
        // same route the SonarQube server already uses and is known to work.
        STAGING_URL     = 'http://host.docker.internal:3001'
        PROD_URL        = 'http://host.docker.internal:3000'
        PROMETHEUS_URL  = 'http://host.docker.internal:9090'

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
        // This is the stage whose absence made coverage 0 percent. It writes
        // coverage/lcov.info, which the Code Quality stage imports.
        // ------------------------------------------------------------------
        stage('Test') {
            steps {
                sh '''
                    set -e
                    npm run test:ci
                    echo "--- coverage file produced ---"
                    ls -l coverage/lcov.info
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
        // Uses the SonarQube plugin configuration already set up in Jenkins.
        // ------------------------------------------------------------------
        stage('Code Quality') {
            steps {
                sh '''
                    set -e
                    echo "--- ESLint ---"
                    npx eslint src tests --format stylish | tee reports/eslint.txt
                '''
                                withSonarQubeEnv('SonarQube') {
                    sh '''
                        npx sonarqube-scanner \
                          -Dsonar.projectKey=spacebook-api \
                          -Dsonar.projectVersion=${RELEASE_VERSION} \
                          -Dsonar.sources=src \
                          -Dsonar.tests=tests \
                          -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                          -Dsonar.exclusions=node_modules/**,coverage/**,reports/**,dist/**,scripts/**,jenkins/**,monitoring/** \
                          -Dsonar.coverage.exclusions=tests/**,src/server.js,scripts/**
                    '''
                }
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/eslint.txt', allowEmptyArchive: true
                }
            }
        }

        // ------------------------------------------------------------------
        // 4. SECURITY
        // Trivy runs as a container, so nothing extra has to be installed in
        // Jenkins. --ignore-unfixed means the build only fails on findings
        // that actually have a patch available.
        // ------------------------------------------------------------------
        stage('Security') {
            steps {
                sh '''
                    set -e
                    AUDIT_FAILED=0

                    echo "--- Dependency scan: npm audit ---"
                    npm audit --json > reports/npm-audit.json || true
                    npm audit --audit-level=high || AUDIT_FAILED=1
                    node -e "const a=require('./reports/npm-audit.json');console.log(JSON.stringify(a.metadata.vulnerabilities))" \
                        | tee reports/npm-audit-summary.txt

                    echo "--- Image scan: Trivy (report) ---"
                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v trivy-cache:/root/.cache/ \
                        aquasec/trivy:0.53.0 image \
                        --scanners vuln --severity HIGH,CRITICAL \
                        --ignore-unfixed --no-progress --format table \
                        --exit-code 0 ${IMAGE_NAME}:${IMAGE_TAG} | tee reports/trivy-report.txt

                    echo "--- Image scan: gate ---"
                    docker run --rm \
                        -v /var/run/docker.sock:/var/run/docker.sock \
                        -v trivy-cache:/root/.cache/ \
                        aquasec/trivy:0.53.0 image \
                        --scanners vuln --severity HIGH,CRITICAL \
                        --ignore-unfixed --no-progress --quiet \
                        --exit-code 1 ${IMAGE_NAME}:${IMAGE_TAG}

                    if [ "${AUDIT_FAILED}" = "1" ]; then
                        echo "npm audit reported a high or critical advisory"
                        exit 1
                    fi
                    echo "Security stage passed"
                '''
            }
            post {
                always {
                    archiveArtifacts artifacts: 'reports/trivy-report.txt, reports/npm-audit*.json, reports/npm-audit-summary.txt',
                                     allowEmptyArchive: true
                }
            }
        }

        // ------------------------------------------------------------------
        // 5. DEPLOY (staging)
        // ------------------------------------------------------------------
        stage('Deploy to Staging') {
            steps {
                sh '''
                    set -e
                    docker network inspect spacebook-net >/dev/null 2>&1 \
                        || docker network create spacebook-net

                    IMAGE_NAME=${IMAGE_NAME} IMAGE_TAG=${IMAGE_TAG} \
                        docker compose -f docker-compose.staging.yml up -d --force-recreate

                    echo "Waiting for staging"
                    for attempt in $(seq 1 20); do
                        if curl -fsS ${STAGING_URL}/health > /dev/null 2>&1; then
                            echo "Staging healthy after ${attempt} attempt(s)"
                            break
                        fi
                        if [ "${attempt}" = "20" ]; then
                            docker logs spacebook-staging --tail 50
                            exit 1
                        fi
                        sleep 3
                    done

                    echo "--- Smoke test ---"
                    curl -fsS ${STAGING_URL}/health | tee reports/staging-health.json
                    echo
                    curl -fsS -o /dev/null -w "GET /api/spaces   -> %{http_code}\\n" ${STAGING_URL}/api/spaces
                    curl -fsS -o /dev/null -w "GET /metrics      -> %{http_code}\\n" ${STAGING_URL}/metrics
                    curl -sS  -o /dev/null -w "GET /api/bookings -> %{http_code} (401 expected)\\n" ${STAGING_URL}/api/bookings
                '''
            }
            post {
                always { archiveArtifacts artifacts: 'reports/staging-health.json', allowEmptyArchive: true }
            }
        }

        // ------------------------------------------------------------------
        // 6. RELEASE (production)
        // ------------------------------------------------------------------
        stage('Release to Production') {
            steps {
                sh '''
                    set -e
                    if docker image inspect ${IMAGE_NAME}:stable >/dev/null 2>&1; then
                        docker tag ${IMAGE_NAME}:stable ${IMAGE_NAME}:rollback
                        echo "Outgoing image kept as ${IMAGE_NAME}:rollback"
                    fi

                    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:${RELEASE_VERSION}
                    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:stable

                    IMAGE_NAME=${IMAGE_NAME} RELEASE_TAG=${RELEASE_VERSION} RELEASE_VERSION=${RELEASE_VERSION} \
                        docker compose -f docker-compose.prod.yml up -d --force-recreate

                    echo "Verifying production"
                    for attempt in $(seq 1 20); do
                        if curl -fsS ${PROD_URL}/health > /dev/null 2>&1; then break; fi
                        if [ "${attempt}" = "20" ]; then
                            echo "Production did not come up, rolling back"
                            docker tag ${IMAGE_NAME}:rollback ${IMAGE_NAME}:stable
                            IMAGE_NAME=${IMAGE_NAME} RELEASE_TAG=stable RELEASE_VERSION=rollback \
                                docker compose -f docker-compose.prod.yml up -d --force-recreate
                            exit 1
                        fi
                        sleep 3
                    done

                    curl -fsS ${PROD_URL}/health | tee reports/production-health.json
                    echo
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
                        echo "Release tagged as v${RELEASE_VERSION}"
                    '''
                }
            }
            post {
                always { archiveArtifacts artifacts: 'reports/production-health.json', allowEmptyArchive: true }
            }
        }

        // ------------------------------------------------------------------
        // 7. MONITORING AND ALERTING
        // ------------------------------------------------------------------
        stage('Monitoring and Alerting') {
            steps {
                sh '''
                    set -e
                    docker compose -f docker-compose.monitoring.yml up -d --build

                    echo "Waiting for Prometheus"
                    for attempt in $(seq 1 30); do
                        if curl -fsS ${PROMETHEUS_URL}/-/ready > /dev/null 2>&1; then break; fi
                        if [ "${attempt}" = "30" ]; then echo "Prometheus did not start"; exit 1; fi
                        sleep 3
                    done

                    echo "--- Generating traffic ---"
                    for i in $(seq 1 20); do
                        curl -fsS -o /dev/null ${PROD_URL}/health || true
                        curl -fsS -o /dev/null ${PROD_URL}/api/spaces || true
                    done

                    sleep 20

                    curl -sS "${PROMETHEUS_URL}/api/v1/query?query=up%7Bjob%3D%22spacebook-prod%22%7D" \
                        > reports/prom-up.json
                    UP=$(node -e "const r=require('./reports/prom-up.json');console.log((r.data.result[0]||{value:[0,'0']}).value[1])")
                    echo "Prometheus reports up{job=spacebook-prod} = ${UP}"
                    if [ "${UP}" != "1" ]; then
                        echo "Prometheus is not scraping production"
                        exit 1
                    fi

                    echo "--- Alert rules loaded ---"
                    curl -sS "${PROMETHEUS_URL}/api/v1/rules" > reports/prom-rules.json
                    node -e "const r=require('./reports/prom-rules.json');r.data.groups.forEach(g=>g.rules.forEach(x=>console.log(x.name+' ['+(x.labels&&x.labels.severity)+'] state='+x.state)))" \
                        | tee reports/alert-rules.txt

                    echo "--- Live metrics ---"
                    curl -sS "${PROMETHEUS_URL}/api/v1/query?query=sum(spacebook_http_requests_total%7Bjob%3D%22spacebook-prod%22%7D)" \
                        > reports/prom-requests.json
                    node -e "const r=require('./reports/prom-requests.json');console.log('Total requests served: '+((r.data.result[0]||{value:[0,'0']}).value[1]))" \
                        | tee reports/prometheus-query.txt

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
                         body: "All seven stages passed.\n\nProduction: ${env.PROD_URL}/health\nLog: ${env.BUILD_URL}console"
                } catch (err) {
                    echo 'Notification email not sent: no SMTP server configured.'
                }
            }
        }
        failure {
            echo "Build ${env.BUILD_NUMBER} failed. Production still runs the previous release."
            script {
                try {
                    mail to: env.NOTIFY_EMAIL,
                         subject: "FAILED: SpaceBook build ${env.BUILD_NUMBER}",
                         body: "The pipeline stopped before completing.\nConsole: ${env.BUILD_URL}console"
                } catch (err) {
                    echo 'Notification email not sent: no SMTP server configured.'
                }
            }
        }
        always {
            sh 'docker image prune -f --filter "until=168h" || true'
        }
    }
}
