# SpaceBook API

A study space booking service for a university campus, written as a Node.js REST
API. Students sign in, search for a room that suits their group, and book it for
a block of time; administrators manage the rooms themselves.

The project exists to be put through a full DevOps pipeline, so it was written
with that in mind: real business rules that can be unit tested, HTTP endpoints
that can be integration tested, a container image that can be scanned and
deployed, and a metrics endpoint that a monitoring tool can scrape.

## Features

| Area | What it does |
| --- | --- |
| Accounts | Registration and login with bcrypt password hashing and JWT sessions |
| Roles | Students book rooms; administrators also create, edit and remove them |
| Spaces | Filter by campus and minimum capacity, and check availability by the hour |
| Bookings | Create, list and cancel, with overlap detection and capacity checks |
| Rules | Maximum booking length, opening hours, and no bookings in the past |
| Operations | `/health` for probes and `/metrics` in Prometheus format |

## Endpoints

```
GET    /health                          service status and version
GET    /metrics                         Prometheus metrics

POST   /api/auth/register               create an account
POST   /api/auth/login                  exchange credentials for a token
GET    /api/auth/me                     the current identity

GET    /api/spaces                      list spaces (?campus= &minCapacity=)
GET    /api/spaces/:id                  a single space
GET    /api/spaces/:id/availability     free hourly slots for a date
POST   /api/spaces                      create a space (admin)
PATCH  /api/spaces/:id                  update a space (admin)
DELETE /api/spaces/:id                  remove a space (admin)

POST   /api/bookings                    create a booking
GET    /api/bookings                    the caller's bookings
GET    /api/bookings/:id                a single booking
DELETE /api/bookings/:id                cancel a booking
```

## Running it locally

```bash
npm install
npm start           # http://localhost:3000
npm test            # 67 unit and integration tests
npm run lint
```

A seeded administrator account is created on start: `admin@spacebook.local`
with the password in `ADMIN_PASSWORD`, which defaults to `ChangeMe123!`.

## Running it in Docker

```bash
docker network create spacebook-net
docker build -t spacebook-api:latest .

IMAGE_TAG=latest docker compose -f docker-compose.staging.yml up -d    # port 3001
RELEASE_TAG=latest docker compose -f docker-compose.prod.yml up -d     # port 3000
docker compose -f docker-compose.monitoring.yml up -d --build          # 9090 and 3002
```

## The pipeline

`Jenkinsfile` defines seven stages after checkout.

| Stage | Tools | What it produces |
| --- | --- | --- |
| Build | npm, Docker | A tagged image plus build metadata, archived in Jenkins |
| Test | Jest, Supertest | JUnit results and an LCOV coverage report |
| Code Quality | ESLint, SonarQube | Analysis against a quality gate that can stop the build |
| Security | npm audit, Trivy | Dependency and image scan reports |
| Deploy | Docker Compose | The staging container on port 3001, health checked |
| Release | Docker Compose, Git | The same image promoted to production on port 3000 and tagged |
| Monitoring | Prometheus, Grafana | Scrape verification, alert rules and live metrics |

## Repository layout

```
src/                 application code (routes, services, middleware)
tests/               unit tests and integration tests
monitoring/          Prometheus config, alert rules, Grafana provisioning
jenkins/Dockerfile   the Jenkins controller image with all pipeline tools
Jenkinsfile          the seven stage pipeline
Dockerfile           multi stage build for the application image
docker-compose.*.yml staging, production and monitoring stacks
```

## Notes on the design

The storage layer is deliberately in memory. Every service reaches it through
`src/data/store.js`, so swapping it for a database would only change that one
file, and in exchange the project has no native dependencies and builds the same
way on a laptop, in a Jenkins agent and inside a container.

The application image is multi stage, runs as an unprivileged user and carries a
`HEALTHCHECK`, which keeps the attack surface small and gives the deployment
stages something reliable to wait on.
