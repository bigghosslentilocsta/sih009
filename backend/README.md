# backend — SIH 26009

Express + MongoDB API. Serves the React frontend and orchestrates the Python
ai-service. **It never talks to Earth Engine directly** — heavy geospatial work
is delegated to `ai-service` over HTTP.

## Setup

```powershell
cd backend
npm install
copy .env.example .env
```

Edit `.env` and set:

| Variable         | Purpose                                             |
| ---------------- | --------------------------------------------------- |
| `MONGODB_URI`    | Your connection string (local or Atlas `mongodb+srv`) |
| `WEATHER_API_KEY`| OpenWeatherMap key (server-side only, never shipped) |
| `AI_SERVICE_URL` | Base URL of the FastAPI service                      |

## Run

```powershell
npm run dev      # nodemon, auto-reload
npm start        # plain node
```

- API root → <http://localhost:5000/api/v1>
- Liveness  → <http://localhost:5000/api/v1/health>
- Readiness → <http://localhost:5000/api/v1/health/ready>

## Endpoints

| Method | Path                     | Description                          |
| ------ | ------------------------ | ------------------------------------ |
| GET    | `/api/v1`                | Service banner + DB status           |
| GET    | `/api/v1/health`         | Liveness probe (no DB round-trip)    |
| GET    | `/api/v1/health/ready`   | Readiness probe (503 if DB down)     |
| GET    | `/api/v1/weather`        | Weather proxy (`lat`, `lon`)         |

## Roles

| Role                 | Access                                        |
| -------------------- | --------------------------------------------- |
| `admin`              | Everything, including `/api/admin/*`           |
| `geologist`          | Map (Module A), Settings                      |
| `operations_manager` | Operations dashboard (Module B), Settings     |
| `executive`          | Executive summary (Module C), Settings        |

Defined once in `src/config/roles.js` and mirrored in `frontend/src/lib/roles.js`.
A role is enforced **server-side** by `authorize(...roles)`; the frontend guard is
UX only.

## Authentication

1. Copy `.env.example` → `.env` and set `JWT_SECRET` (required) plus your
   `MONGODB_URI` and `WEATHER_API_KEY`.
2. `npm run seed` — creates the default admin **only if no admin exists**
   (`admin@moil.gov.in`). `npm start` also runs the seed automatically.
3. Sign in at <http://localhost:5173/login>.

### Endpoints

| Method | Path                        | Access    | Description                        |
| ------ | --------------------------- | --------- | ---------------------------------- |
| POST   | `/api/auth/login`           | public    | Returns `{ user, token, home }`    |
| POST   | `/api/auth/register`        | admin     | Admin-managed account creation     |
| GET    | `/api/auth/me`              | any user  | Current user document              |
| PATCH  | `/api/auth/profile`         | any user  | Name / designation / phone         |
| POST   | `/api/auth/change-password` | any user  | Requires current password          |
| POST   | `/api/auth/logout`          | any user  | Acknowledges sign-out              |
| GET    | `/api/admin/users`          | admin     | List, `?search=&role=&page=`       |
| POST   | `/api/admin/users`          | admin     | Create a user with a role          |
| GET    | `/api/admin/users/:id`      | admin     | Single user                        |
| PATCH  | `/api/admin/users/:id`      | admin     | Update role / active state         |
| DELETE | `/api/admin/users/:id`      | admin     | Deactivate (soft delete)           |
| POST   | `/api/admin/users/:id/reset-password` | admin | Generate a temporary password |
| POST   | `/api/v1/exploration/analyze` | geologist, admin | Module A — proxy to ai-service |
| GET    | `/api/v1/operations/forecast` | operations_manager, admin | Module B forecast |
| POST   | `/api/v1/operations/forecast` | operations_manager, admin | Module B + scenario |
| GET    | `/api/v1/operations/equipment` | operations_manager, admin | Fleet state        |
| GET    | `/api/v1/operations/shifts` | operations_manager, admin | Production history |
| GET    | `/api/v1/executive/summary` | executive, admin | Module C — macro KPIs        |
| GET    | `/api/v1/executive/export`  | executive, admin | Module C — CSV report download |

Auth routes are **also** mounted under `/api/v1` so both the spec paths and the
versioned prefix resolve to the same router.

## Operational seed

```powershell
npm run seed:ops     # also runs automatically on `npm start`
```

Populates the Module B dashboard on first boot — both steps are **idempotent**
(they skip when data already exists):

- **20 machines** across 4 sectors — 8 Dumpers, 4 Excavators, 3 Shovels,
  2 Drills, 2 Conveyors, 1 Crusher. 17 active, 2 in maintenance, 1 down
  (`SHV-03`, overdue boom weldment) so bottleneck alerting has something real
  to find.
- **224 shift records** — 8 weeks × 4 sectors, ~50,400 t targeted against
  ~45,400 t actual (**90.1% attainment**).

Attainment is driven by the same signals the risk model uses — Sunday
effect, rainfall and unplanned breakdowns — not random noise, so the history
and the forecast tell one consistent story. The seed uses a fixed PRNG
(`src/utils/random.js`), so the data is identical on every machine.

Each machine also gets a `failure_probability` derived from its status, wear
hours, downtime and maintenance urgency
(`EquipmentLog.deriveFailureProbability()`).

## Module A — exploration proxy

The backend never touches Earth Engine. It authenticates the caller, validates
the polygon structurally, then forwards to the Python service
(`src/services/aiClient.js`, 120 s timeout).

```jsonc
POST /api/v1/exploration/analyze      // or /api/exploration/analyze
{
  "name": "Balaghat Block",
  "geometry": { "type": "Polygon", "coordinates": [[[79.05,22.15], ...]] },
  "gridResolution": 12
}
```

The upstream payload is returned unchanged plus an `analyzedBy` block
(`id`, `name`, `email`, `role`), and every call is logged to stdout:

```
[exploration] user=a.b@moil.gov.in role=geologist zone=zone_e624… score=47.47 source=earth_engine ms=34120
```

Upstream failures are translated: `ECONNABORTED` → 504, unreachable service →
503, invalid geometry → 422, everything else → 502.

## Module B — operations forecast

`src/services/weatherService.js` keeps the OpenWeatherMap key server-side and
re-bins the 3-hourly forecast into **daily** rainfall totals, because the risk
model reasons in mm/day. If the provider is unreachable or the key is invalid
it falls back to a deterministic synthetic forecast and marks
`weather.source = "synthetic"` — the UI shows an "synthetic weather" badge, so
a modelled forecast is never presented as real.

`GET /forecast` returns `weather` + `performance` (attainment + daily series)
+ `equipment` + `risk` (scored by the ai-service, including
`model_coefficients` for the client-side simulator).
`POST /forecast` re-scores with a `scenario` and attaches `requested_by`.

### Security notes

- Passwords are bcrypt-hashed (cost from `BCRYPT_ROUNDS`, default 12) and the
  field is `select: false` — it cannot leak through an accidental query.
- Login does not reveal whether an account exists (identical response + a dummy
  bcrypt comparison for timing).
- 5 failed logins lock the account for 15 minutes (`MAX_FAILED_LOGINS`,
  `LOCKOUT_MINUTES`); `/api/auth/login` has its own tighter rate limit.
- `authenticate` re-reads the user on every request, so deactivating an account
  or changing a role takes effect **immediately**, not when the token expires.
- Guards prevent removing the last active admin, and an admin cannot demote or
  deactivate themselves.
- `ADMIN_PASSWORD` is **required** when `NODE_ENV=production`; in development it
  falls back to `Admin@12345` with a loud warning. Change it immediately.
- Self-registration is disabled — accounts are only issued by an admin.


## Module C - executive summary

`src/services/executiveService.js` rolls up macro metrics from real database
records - nothing is hard-coded.

| Metric                   | Source                                     |
| ------------------------ | ------------------------------------------ |
| Active reserve blocks    | `ReserveBlock` (area, reserve, grade)      |
| Operational health score | `EquipmentLog` (availability, failure, maintenance) |
| Monthly fulfilment %     | `ShiftTarget` bucketed by calendar month   |
| Forward risk / alerts    | the same Module B forecast ops see         |

Health score = 50% availability + 30% reliability + 20% maintenance compliance,
banded A-D. Because the risk section reuses `buildForecast()`, the executive and
operational views can never disagree.

`GET /export` returns a `text/csv` attachment (`SIH26009_Executive_Report_YYYY-MM-DD.csv`)
with six sections: headline KPIs, reserve inventory, operational health,
monthly production, forward risk and active alerts. Values are properly escaped,
and a UTF-8 BOM is prepended so Excel does not mangle characters. Pass
`?format=json` to get the same CSV inside a JSON envelope for tooling.

### Reserve provenance

`ReserveBlock.source` records where each estimate came from (`seed`,
`field_survey`, `gee_analysis`, `moil_records`). The seed populates reference
blocks tagged `seed`, and the summary surfaces that provenance so seeded figures
are never mistaken for surveyed or Earth Engine-derived reserves. The chart is
explicitly a stand-in:

> The current production history only spans two calendar months, so the
> fulfilment trend line has a single point and reads as flat. Extend the
> `seedOperations` window (or import real shift data) to make it meaningful.
