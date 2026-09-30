# frontend — SIH 26009

React 18 + Vite + Tailwind CSS v4 dashboard. Talks only to the Node backend,
which in turn calls the Python ai-service.

## Setup

```powershell
cd frontend
npm install
copy .env.example .env
```

## Run

```powershell
npm run dev       # http://localhost:5173
npm run build     # production bundle -> dist/
npm run preview   # serve the built bundle
```

## Layout

```
frontend/
├── index.html
├── vite.config.js          # React + Tailwind plugins, /api dev proxy, chunk split
├── src/
│   ├── main.jsx            # React root + BrowserRouter + AuthProvider
│   ├── App.jsx             # route table (role-gated)
│   ├── index.css           # Tailwind v4 @import + design tokens
│   ├── lib/
│   │   ├── apiClient.js    # axios instance: bearer token, 401 -> sign out
│   │   ├── exploration.js  # Module A API calls
│   │   ├── operations.js   # Module B API calls + client-side risk mirror
│   │   ├── executive.js    # Module C summary + CSV download
│   │   ├── roles.js        # role constants, labels, home paths
│   │   └── tokenStore.js   # localStorage token helpers
│   ├── context/
│   │   └── AuthContext.jsx # session state, login/logout, profile, password
│   ├── data/
│   │   └── miningBlocks.js # pre-defined MOIL lease blocks (GeoJSON polygons)
│   ├── components/
│   │   ├── auth/ProtectedRoute.jsx  # route guard
│   │   ├── admin/CreateUserForm.jsx # admin account creation
│   │   ├── admin/UserTable.jsx      # user table + inline actions
│   │   ├── layout/                  # AppLayout shell + role-aware Sidebar
│   │   ├── map/
│   │   │   ├── MiningBlocks.jsx        # selectable lease polygons
│   │   │   ├── PolygonDrawer.jsx       # click-to-draw (no extra dependency)
│   │   │   ├── SuitabilityHeatmap.jsx  # colour-coded score grid
│   │   │   ├── ZoneAnalysisPanel.jsx   # AI breakdown + CSV export
│   │   │   └── suitability.js          # shared colour ramp + formatting
│   │   ├── operations/
│   │   │   ├── BottleneckAlerts.jsx      # AI bottleneck alert box
│   │   │   ├── ProductionTrendChart.jsx  # target vs actual + attainment
│   │   │   ├── EquipmentUptimeChart.jsx  # uptime/downtime + status donut
│   │   │   └── ScenarioSimulator.jsx     # live mitigation sliders
│   │   └── ui/                      # Button, Field, Alert
│   └── pages/
│       ├── Login.jsx              # sign in + role-based redirect
│       ├── AdminUsers.jsx         # user management panel
│       ├── Settings.jsx           # profile + change password (all roles)
│       ├── MapPage.jsx            # Module A exploration workspace
│       ├── OperationsDashboard.jsx# Module B operations dashboard
│       ├── Executive.jsx          # Module C executive summary
│       └── Placeholder.jsx        # stub for unbuilt routes
```

## Module A — Reserve exploration (`/map`)

For **geologists** and admins. The page is a two-column workspace: controls +
AI panel on the left, satellite map on the right.

1. **Select a block** from the dropdown (Balaghat, Bharweli, Dongarbodi, Gua,
   Bonke-Khondsia) — the map flies to it — **or** press *Draw polygon* and
   click the map to place points.
2. Press **Analyze Zone**. A spinner replaces the panel while the backend
   proxies to the ai-service (typically 30–60 s).
3. The response renders as a colour-coded heatmap (`SuitabilityHeatmap`) plus a
   breakdown panel with the score, per-factor bars, raw spectral indices, a
   legend, a recommendation and a **CSV export**.

Heatmap ramp (shared with the panel so colours always agree):

| Score   | Band       | Colour |
| ------- | ---------- | ------ |
| 0–20    | Very low   | slate  |
| 20–40   | Low        | blue   |
| 40–60   | Moderate   | yellow |
| 60–75   | High       | orange |
| 75–100  | Very high  | red    |

If the response comes back `data_source: "simulated"`, the panel shows an amber
warning — the score is from the fallback model, not satellite data.

> Polygon drawing is built on native Leaflet map events rather than
> `leaflet-draw` / `react-leaflet-draw`, which are unmaintained for React 18.
> The behaviour needed here is small enough not to justify the dependency.

## Module B — Operations dashboard (`/dashboard`, alias `/operations`)

For **operations managers** and admins. Four sections, all driven by one
`GET /operations/forecast` call:

1. **AI Bottleneck Alert Box** — the headline risk sentence, the risk band, the
   confidence, and each ranked bottleneck with its estimated percentage-point
   impact and a recommended action.
2. **KPI row** — projected shortfall, historical attainment, fleet
   availability, peak forecast rainfall.
3. **Target vs. Actual Production** — a Recharts composed chart (target bars,
   actual area, attainment line) over the last 8 weeks of shift history.
4. **Equipment Uptime vs. Downtime** — stacked available/downtime hours per
   machine, plus a fleet-status donut.
5. **Forecast rainfall vs. projected shortfall** — a table of every day in the
   horizon with rain, target, projected tonnage and shortfall %.

### Scenario Simulator

Four sliders (covered pits, labour shift, maintenance acceleration, spare fleet)
recompute the projection **locally, on every drag**, using the
`risk.model_coefficients` the API returns.

> The simulator holds **no model constants of its own** — every weight comes from
> the response. It therefore cannot drift from the service, and this is verified
> by an automated parity test (client mirror vs. server, delta < 0.01pp).

"Apply scenario" re-scores server-side (`POST /operations/forecast`) and records
who ran it. The panel shows unmitigated vs. mitigated shortfall and the
improvement in percentage points.

## Module C — Executive summary (`/executive`)

For **executives** and admins. Macro view of the whole platform, driven by
`GET /api/executive/summary`:

1. **KPI cards** — identified reserve (Mt), operational health score + grade,
   monthly fulfilment %, projected shortfall %.
2. **Active alerts** — merged from the Module B bottleneck list plus a
   maintenance-overdue check.
3. **Recharts** — monthly production fulfilment (target/actual bars + a
   fulfilment % line) and reserve by block (bars coloured by grade band).
4. **Health breakdown** — availability / reliability / maintenance compliance
   with their weights, plus the provenance of the reserve figures.
5. **Reserve table** — every block with area, reserve, contained metal, grade,
   status and `source`.

### Download Executive Report

A prominent button calls `GET /executive/export` and saves a CSV containing the
same figures: headline KPIs, full reserve inventory, health breakdown, monthly
production, forward risk and active alerts.

> A plain `<a href>` cannot send the `Authorization` header, so the file is
> fetched through the authenticated axios client and handed to the browser as a
> blob. The filename comes from the server's `Content-Disposition`.

## Routes

| Path         | Page                                              | Access                       |
| ------------ | ------------------------------------------------- | ---------------------------- |
| `/login`     | Sign in (public)                                  | public                       |
| `/admin`     | User management                                   | `admin`                      |
| `/map`       | React-Leaflet satellite map of reserve blocks      | `geologist`, `admin`         |
| `/dashboard` | Operations dashboard (Module B)                   | `operations_manager`, `admin`|
| `/operations`| Alias for `/dashboard`                            | `operations_manager`, `admin`|
| `/executive` | Executive summary (Module C stub)                 | `executive`, `admin`         |
| `/settings`  | Profile + change password                         | every role                   |

`/` redirects to the signed-in user's role home. After a successful login the
API returns a `home` path and the client navigates there, so each role lands on
its own module.

## Authentication

- `src/context/AuthContext.jsx` holds user + session status. On mount it
  revalidates the stored token against `GET /api/auth/me`, so a revoked session
  cannot be revived from `localStorage` alone.
- `src/lib/apiClient.js` attaches the bearer token and turns any 401 into a
  global sign-out.
- `src/components/auth/ProtectedRoute.jsx` gates routes; it renders a spinner
  while revalidating so a page refresh does not flash the login screen.
- The sidebar only lists modules the current role can actually open.

> The frontend guard is UX only — every rule is enforced again by the API via
> `authorize(...roles)`. Hiding a link is not access control.

## Notes

- **Tailwind v4** is configured CSS-first (`@import 'tailwindcss'` + `@theme`
  in `src/index.css`). There is deliberately **no `tailwind.config.js`** or
  PostCSS config — v4 uses the `@tailwindcss/vite` plugin instead.
- `/api/*` is proxied to `http://localhost:5000` in dev (see `vite.config.js`),
  so no CORS setup is needed locally.
- `MapView` fixes the Leaflet default-icon asset paths, which otherwise 404
  under bundlers.
