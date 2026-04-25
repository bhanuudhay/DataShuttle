# DataShuttle

🚀 **Live Demo:** [https://data-shuttle-nu.vercel.app/](https://data-shuttle-nu.vercel.app/)

A web-based tool for connecting to MongoDB instances, browsing databases/collections, and copying data across clusters. Built with a **Next.js** frontend and a **FastAPI** backend, fully containerised with Docker Compose.

## Architecture

| Service  | Image / Build          | Port  | Description                              |
|----------|------------------------|-------|------------------------------------------|
| frontend | `./mongo-dump-frontend` (Node 20) | 3000  | Next.js UI                               |
| backend  | `./mongo-dump-backend` (Python 3.12) | 8003  | FastAPI REST API                         |
| mongo    | `mongo:7`              | 27017 | MongoDB — stores user accounts & sessions |
| redis    | `redis:7-alpine`       | 6379  | Redis — session / cache store            |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) (v2+)

## Quick Start

```bash
# Clone the repo
git clone <repo-url> && cd mongo_dump

# Spin everything up
docker compose up -d --build

# Verify all four containers are running
docker compose ps
```

Once healthy, open **http://localhost:3000** in your browser.

| URL                        | What it is           |
|----------------------------|----------------------|
| http://localhost:3000      | Frontend (UI)        |
| http://localhost:8003      | Backend API          |
| http://localhost:8003/docs | Swagger API docs     |

## Stopping & Cleaning Up

```bash
# Stop all services
docker compose down

# Stop and remove persisted MongoDB data
docker compose down -v
```

## Environment Variables

### Backend

Copy the example and fill in your values:

```bash
cp mongo-dump-backend/.env.example mongo-dump-backend/.env
```

| Variable             | Default (Docker)                              | Purpose                         |
|----------------------|-----------------------------------------------|---------------------------------|
| `MONGO_URI`          | `mongodb://mongo:27017/datashuttle-users`     | Internal MongoDB connection     |
| `JWT_SECRET`         | *(set in compose)*                            | JWT signing key                 |
| `JWT_ALGORITHM`      | `HS256`                                       | JWT algorithm                   |
| `JWT_EXPIRY_MINUTES` | `1440`                                        | Token lifetime (24 h)           |
| `REDIS_HOST`         | `redis`                                       | Redis hostname (Docker service) |
| `REDIS_PORT`         | `6379`                                        | Redis port                      |
| `REDIS_DB`           | `0`                                           | Redis database index            |
| `CORS_ORIGINS`       | `http://localhost:3000`                       | Allowed CORS origins            |

### Frontend

Copy the example and fill in your values:

```bash
cp mongo-dump-frontend/.env.example mongo-dump-frontend/.env.local
```

| Variable               | Default                  | Purpose             |
|------------------------|--------------------------|---------------------|
| `NEXT_PUBLIC_API_URL`  | `http://localhost:8003`  | Backend API URL     |

> **Production note:** Change `JWT_SECRET` to a strong, random value before deploying.

## Connecting to the Docker MongoDB

### Do NOT open `localhost:27017` in a browser

MongoDB does not speak HTTP. If you paste `localhost:27017` into a browser you will see:

> *"It looks like you are trying to access MongoDB over HTTP on the native driver port."*

This is **not an error** — it simply means MongoDB is running and you tried to talk to it with the wrong protocol.

### Use the right tool instead

**From your terminal (via Docker):**

```bash
docker exec -it mongo_dump-mongo-1 mongosh
```

**From a GUI:** use [MongoDB Compass](https://www.mongodb.com/products/compass) and connect to `mongodb://localhost:27017`.

### Local MongoDB vs Docker MongoDB — port conflict

If you also have MongoDB installed locally (outside Docker), **both instances compete for port 27017**. When you run `mongosh "mongodb://localhost:27017"` from your host machine you may connect to the **local** instance instead of the Docker one.

**How to tell which one you're connected to:**

```bash
# Connect to the Docker MongoDB specifically
docker exec -it mongo_dump-mongo-1 mongosh --eval "db.getMongo().getDBNames()"

# Connect to whatever is on localhost:27017 (may be local install)
mongosh --eval "db.getMongo().getDBNames()"
```

If the database lists differ, you have two separate MongoDB instances.

**Fix options:**

| Option | Steps |
|--------|-------|
| **Stop local MongoDB** (recommended) | Windows: `net stop MongoDB` — then restart Docker containers so they claim port 27017 |
| **Change Docker's port** | In `docker-compose.yml`, change `"27017:27017"` to e.g. `"27018:27017"`, then connect with `mongosh "mongodb://localhost:27018"` |

> **Note:** The backend container connects to MongoDB over Docker's internal network (`mongodb://mongo:27017`), so it is unaffected by host port conflicts.

## Connecting to remote MongoDB (Dev via SSM, Stg via VPN)

The backend opens outbound connections to whatever MongoDB URI the UI submits. Two things to keep in mind:

1. **Dev uses AWS SSM port-forwarding** — a tunnel on your host's loopback.
2. **Stg uses VPN** — private IPs like `10.1.1.x` are reachable only from your host, not from inside Docker.

### Dev — open the SSM tunnel and use the matching port

Pick one local port (the example uses `8000`) and use it in **both** places:

```bash
# 1. Log in
saml2aws login \
  --idp-account "arn:aws:iam::611263743042:role/shyftlabs-relay" \
  --profile "dev" \
  --session-duration 900 \
  --browser-type=chrome \
  --skip-prompt

# 2. Start the tunnel  (localPortNumber MUST match the port in your mongo URI)
aws ssm start-session \
  --target i-0236341c888eb9c64 \
  --profile "dev" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters '{
    "host": ["10.1.1.228"],
    "portNumber": ["27017"],
    "localPortNumber": ["8000"]
  }'
```

Then in the UI, use:

```
mongodb://<user>:<pass>@127.0.0.1:8000/?directConnection=true&authSource=<authDb>
```

> The `Connection refused` error on `127.0.0.1:8009` you saw earlier was a **port mismatch** — the tunnel was on `8000`, the URI said `8009`. Always keep them identical.

When the backend runs inside Docker, the code automatically rewrites `127.0.0.1` / `localhost` in the URI to `host.docker.internal` so the container can reach the tunnel on the host. No change to your URI is needed.

### Stg — run the backend on the host (not in Docker)

When the VPN is up, the route to `10.1.1.114` lives on your Windows host. Docker Desktop on Windows does **not** push those routes into the container, so `mongodb://...@10.1.1.114:27017` will hang with `No servers found yet` when attempted from the Dockerised backend.

**Fix:** stop the Dockerised backend and run it directly on the host for the duration of the stg session:

```powershell
# Stop only the backend container; leave mongo + redis + frontend running
docker compose stop backend

# In a fresh terminal, run the backend on the host
cd mongo-dump-backend
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

Then use the stg URI as-is:

```
mongodb://<user>:<pass>@10.1.1.114:27017/<db>?authSource=<authDb>
```

With the backend on the host, it sees the VPN routes and can reach `10.1.1.114` directly. The same host-run backend also works for Dev (it reaches the SSM tunnel on real `127.0.0.1`, so no rewrite is needed).

### Quick troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused` on `127.0.0.1:<port>` | SSM tunnel not running OR port mismatch | Start the SSM session; make the URI's port equal to `localPortNumber` |
| `No servers found yet` for `10.x.x.x` | Backend in Docker, VPN only on host | Run backend on host with `uvicorn` (see above) |
| `Authentication failed` | Wrong `authSource`, user, or password | Add `?authSource=<db>` that matches where the user was created |
| `No servers found yet` for `127.0.0.1` (from host) | SSM session died (token expired after `--session-duration 900`) | Re-run `saml2aws login` and restart `aws ssm start-session` |

## Local Development (without Docker)

If you want to run the backend directly on your machine:

```bash
cd mongo-dump-backend
cp .env.example .env          # then edit .env with your values
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8003 --reload
```

For the frontend:

```bash
cd mongo-dump-frontend
cp .env.example .env.local    # then edit .env.local with your values
npm install
npm run dev
```

## Project Structure

```
mongo_dump/
├── docker-compose.yml          # Orchestrates all services
├── mongo-dump-backend/
│   ├── Dockerfile
│   ├── main.py                 # FastAPI entry point
│   ├── requirements.txt
│   ├── .env.example            # Template for local dev config
│   └── app/
│       ├── controllers/        # Route handlers
│       ├── models/             # Pydantic models
│       └── services/           # Business logic & connection pool
└── mongo-dump-frontend/
    ├── Dockerfile
    ├── package.json
    ├── .env.example            # Template for frontend config
    └── src/
        └── app/                # Next.js app router pages
```
