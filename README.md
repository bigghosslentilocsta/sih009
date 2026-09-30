# SIH 26009 — Manganese Reserve Intelligence Platform

Identify manganese (Mn) reserves and predict production shortfall using
geospatial analysis, machine learning and production data.

```
sih009/
├── ai-service/   Python · FastAPI · Google Earth Engine   (all geospatial analysis)
├── backend/      Node.js · Express · MongoDB             (API + orchestration)
└── frontend/     React · Tailwind CSS · Leaflet · Recharts (dashboard + map)
```

## Architecture

```
   ┌────────────┐        ┌────────────┐        ┌────────────┐
   │  frontend  │  HTTP  │  backend   │  HTTP  │ ai-service │
   │ React/Vite │ ─────► │  Express   │ ─────► │  FastAPI   │
   │  :5173     │        │  MongoDB   │        │    GEE     │
   └────────────┘        │  :5000     │        │   :8000    │
                         └────────────┘        └────────────┘
```

- **frontend** — never talks to Earth Engine or the database directly.
- **backend** — owns MongoDB persistence, proxies third-party APIs (weather)
  so API keys stay server-side, and forwards geospatial work to the AI service.
- **ai-service** — the only component with Google Earth Engine access. Handles
  raster analysis, terrain derivatives and model inference.

## Google Earth Engine

The quota project is configured in **one place** — `ai-service/app/config.py`,
overridable via `GEE_PROJECT`:

```
GEE_PROJECT=gen-lang-client-0167226131
```

Authenticate once per machine:

```powershell
earthengine authenticate
```

Verify the whole geospatial pipeline:

```powershell
cd ai-service
python scripts/gee_sample.py
```

Earth Engine initialisation is **lazy and thread-safe** — the API boots instantly
and only contacts Google on the first request that actually needs it.

## Authentication & RBAC

Four roles, defined once in `backend/src/config/roles.js` and mirrored in
`frontend/src/lib/roles.js`:

| Role                 | Lands on      | Module                     |
| -------------------- | ------------- | -------------------------- |
| `admin`              | `/admin`      | User management            |
| `geologist`          | `/map`        | A — geospatial exploration |
| `operations_manager` | `/dashboard`  | B — shortfall prediction   |
| `executive`          | `/executive`  | C — executive summary      |

Every role can reach `/settings` to update their details and change their
password.

Access is enforced **on the API** with `authenticate` + `authorize(...roles)`.
The frontend `ProtectedRoute` is only a UX layer — hiding a link is not access
control.

### First run

```powershell
cd backend
npm run seed     # creates admin@moil.gov.in only if no admin exists
npm run dev
```

Then sign in at <http://localhost:5173/login>.

| Method | Path                        | Access    |
| ------ | --------------------------- | --------- |
| POST   | `/api/auth/login`           | public    |
| POST   | `/api/auth/register`        | admin     |
| GET    | `/api/auth/me`              | any user  |
| PATCH  | `/api/auth/profile`         | any user  |
| POST   | `/api/auth/change-password` | any user  |
| GET    | `/api/admin/users`          | admin     |
| POST   | `/api/admin/users`          | admin     |
| PATCH  | `/api/admin/users/:id`      | admin     |
| DELETE | `/api/admin/users/:id`      | admin     |

See [`backend/README.md`](backend/README.md) for the full endpoint table and
security notes.

## Modules

| Module | Route                      | Role                 | What it does                                                              |
| ------ | -------------------------- | -------------------- | ------------------------------------------------------------------------- |
| **A**  | `/map`                     | geologist, admin     | Sentinel-2 + SRTM analysis of a lease block → suitability score, heatmap   |
| **B**  | `/dashboard`, `/operations`| operations_manager   | Weather + fleet risk model, bottleneck alerts, live scenario simulator      |
| **C**  | `/executive`               | executive            | Macro KPIs, monthly fulfilment, health score, CSV report download          |

Each module is a separate concern: **A** is the only thing that touches Earth
Engine, **B** is the only thing that touches the weather provider, and **C**
reads nothing but the database plus B's forecast.

## Quick start

Three terminals:

```powershell
# 1. AI service
cd ai-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
earthengine authenticate      # one-time, per machine
uvicorn main:app --reload --port 8000

# 2. Backend
cd ..\backend
npm install
copy .env.example .env        # set JWT_SECRET + MONGODB_URI + WEATHER_API_KEY
npm run seed                  # creates admin@moil.gov.in (idempotent)
npm run dev

# 3. Frontend
cd ..\frontend
npm install
copy .env.example .env
npm run dev
```

| Service          | URL                                      |
| ---------------- | ---------------------------------------- |
| Frontend         | http://localhost:5173                     |
| Backend API      | http://localhost:5000/api/v1              |
| AI service       | http://localhost:8000                     |
| Swagger / ReDoc  | http://localhost:8000/docs · /redoc       |

### Default sign-in

`npm run seed` creates an administrator on first boot:

- **Email:** `admin@moil.gov.in`
- **Password:** `ADMIN_PASSWORD`, or `Admin@12345` in development

> **Change it immediately in a real deployment.** `ADMIN_PASSWORD` becomes
> mandatory when `NODE_ENV=production`.

An admin can then create `geologist`, `operations_manager` and `executive`
accounts from **User Management**.

### Environment

Each service reads its own `.env`; a consolidated reference covering all three
lives in the root [`.env.example`](.env.example).

| Variable                    | Service    | Required | Purpose                            |
| --------------------------- | ---------- | -------- | ---------------------------------- |
| `MONGODB_URI`               | backend    | yes      | MongoDB connection string          |
| `JWT_SECRET`                | backend    | yes      | Token signing key (32+ chars)      |
| `WEATHER_API_KEY`           | backend    | yes      | OpenWeatherMap (Module B)          |
| `ADMIN_PASSWORD`            | backend    | prod     | First-boot admin password          |
| `GEE_PROJECT`               | ai-service | yes      | Earth Engine quota project         |
| `VITE_API_BASE_URL`         | frontend   | no       | Blank in dev (uses the Vite proxy) |

Generate a secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Seeded data

`npm run seed` (admin) and `npm run seed:ops` both run automatically on
`npm start` and are **idempotent**:

- 1 admin account
- 6 reserve blocks (485.5 Mt, tagged `source: "seed"`)
- 20 machines (17 active, 2 in maintenance, 1 down)
- 224 shift records over 8 weeks (90.1% attainment)

> The seeded blocks and weather are **reference data**, not survey results, and
> are labelled as such in the UI. Module A analyses run live against Earth
> Engine; Module B falls back to a synthetic forecast when no valid
> `WEATHER_API_KEY` is configured, and shows a badge saying so.

## Per-service docs

Each directory has its own README with endpoint tables and details:

- [`ai-service/README.md`](ai-service/README.md)
- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)

## Configuration files

Each service ships a `.env.example` template. **No real secrets are committed** —
copy the template to `.env` and fill in your own values.
