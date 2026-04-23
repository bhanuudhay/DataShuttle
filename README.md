# DataShuttle

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
