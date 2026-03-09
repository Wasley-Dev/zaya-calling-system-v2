# Zaya Group – Calling System v2

A production-ready full-stack CRM rebuilt from the original MS Access database.

---

## Quick Start (VS Code)

```bash
# 1. Open in VS Code
code zaya-calling-system-v2

# 2. Install all dependencies
npm run install:all

# 3. Run both backend + frontend together
npm run dev:full
```

Open **http://localhost:3000**

---

## What's New in v2

| Feature | v1 | v2 |
|---------|----|----|
| Inline quick-edit (status/stage) | ✗ | ✅ Click badge to change |
| Kanban board view | ✗ | ✅ Pipeline by stage |
| Log individual calls | ✗ | ✅ With outcome, duration, next action |
| Activity feed | ✗ | ✅ All changes tracked |
| Overdue follow-up alerts | ✗ | ✅ Sidebar badge + alerts |
| Priority levels | ✗ | ✅ High / Normal / Low |
| Assignee tracking | ✗ | ✅ Assign to team member |
| Driver compliance matrix | Basic | ✅ DVLA / DBS / PCO with quick set |
| Expiring licences filter | ✗ | ✅ Dedicated tab |
| Vehicle type tracking | ✗ | ✅ |
| Delete attachments | ✗ | ✅ |
| Delete call sessions | ✗ | ✅ |
| Week-over-week trend | ✗ | ✅ Dashboard KPI |
| Call outcomes breakdown | ✗ | ✅ |
| Compression + Helmet | ✗ | ✅ Production-ready |

---

## Tech Stack

| Layer    | Technology               |
|----------|--------------------------|
| Backend  | Node.js 18 + Express 4   |
| Database | SQLite via better-sqlite3 |
| Frontend | React 18 + React Router 6 |
| HTTP     | Axios                    |
| Icons    | lucide-react             |
| Toasts   | react-hot-toast          |
| Security | helmet + compression     |

---

## Project Structure

```
zaya-calling-system-v2/
│
├── server.js                  # Express entry point
├── package.json
├── .env                       # Config (PORT, DB_PATH)
│
├── db/
│   └── database.js            # SQLite schema, seed data
│
├── routes/
│   ├── contacts.js            # CRUD + calls + attachments
│   ├── driverDetails.js       # Licence + compliance
│   ├── callLogs.js            # Report export data
│   ├── activity.js            # Global activity feed
│   └── stats.js               # Dashboard analytics
│
├── uploads/                   # Uploaded files (auto-created)
├── data/
│   └── zaya.db                # SQLite DB (auto-created on first run)
│
└── client/                    # React app
    ├── public/index.html
    └── src/
        ├── App.js             # Router + Sidebar layout
        ├── index.js
        ├── index.css          # Global styles (CSS variables)
        ├── pages/
        │   ├── Dashboard.js   # KPIs, pipeline, activity, compliance
        │   ├── ContactList.js # Table + Kanban views, inline editing
        │   ├── ContactForm.js # Full edit: info, driver, calls, files, activity
        │   ├── Drivers.js     # Licence matrix with compliance checks
        │   ├── Reports.js     # Full log + CSV export
        │   └── ActivityPage.js
        └── utils/
            ├── api.js         # All API calls
            └── helpers.js     # Formatters, constants, badge helpers
```

---

## API Reference

### Contacts  `/api/contacts`
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/`  | List with filters: `?search=&status=&stage=&caller_type=&booking=&priority=&overdue=true` |
| GET    | `/:id` | Single contact with sessions, activity, attachments |
| POST   | `/`  | Create |
| PUT    | `/:id` | Full update |
| PATCH  | `/:id/quick` | Quick update: Status, Stage, Booking, Priority |
| DELETE | `/:id` | Delete |
| POST   | `/:id/calls` | Log a call session |
| DELETE | `/:id/calls/:sessionId` | Delete call session |
| POST   | `/:id/attachments` | Upload file (multipart) |
| DELETE | `/:id/attachments/:attId` | Delete attachment |

### Driver Details  `/api/driver-details`
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/`  | All drivers with contact info |
| GET    | `/expiring` | Licences expiring ≤60 days |
| GET    | `/by-contact/:id` | Driver record for a contact |
| POST   | `/`  | Create or upsert |
| PUT    | `/:id` | Update |
| DELETE | `/:id` | Delete |

### Other
| Endpoint | Description |
|----------|-------------|
| GET `/api/stats` | Dashboard analytics |
| GET `/api/call-logs` | Full report data |
| GET `/api/activity?limit=40` | Activity feed |

---

## Database Schema

### CallLogs
Fields: ID, First_Name, Last_Name, Job_Title, Mobile_Phone, E_mail_Address,
Address, Country_Region, Caller_Type, Status, Stage, Booking, Documentations,
Remarks, Notes, Attachments (JSON), Priority, Assigned_To, Last_Call_Date,
Next_Call_Date, Call_Count, Created_At, Updated_At

### DriverDetails
Fields: DriverDetailID, CallLogsID (FK), DriverName, LicenseNumber, LicenseClass,
LicenseIssueDate, LicenseExpiryDate, DVLACheck, DBSCheck, PCOCheck, VehicleType,
Notes, Created_At, Updated_At

### CallSessions
Fields: SessionID, CallLogsID (FK), Outcome, Duration_Min, Notes, Called_By,
Called_At, Next_Action

### ActivityLog
Fields: ActivityID, CallLogsID (FK), Action, Detail, Entity, Created_By, Created_At

---

## Production Deployment

```bash
# Build React + run Express to serve it
npm run start:prod
```

Or deploy to any Node.js host (Railway, Render, Heroku, VPS):

1. Set `NODE_ENV=production` in environment
2. Set `PORT` if needed
3. Run `npm run install:all && npm run start:prod`

---

## Desktop Auto Updates

Desktop releases now support Electron auto-update through GitHub Releases.

- `main` branch pushes build installer artifacts only.
- `v*` tags publish signed Windows and macOS releases for the update feed.
- Packaged apps check for updates automatically, download them in the background, and prompt users to restart when the update is ready.

Required GitHub Actions secrets for signed release publishing:

- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`
- `MACOS_CSC_LINK`
- `MACOS_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Release flow:

```bash
git tag v2.0.7
git push origin v2.0.7
```

That tag builds signed installers, publishes the GitHub Release feed files, and makes the update available to installed desktop clients.

---

## Customisation

- **Add caller types**: Edit `CALLER_TYPES` in `client/src/utils/helpers.js`
- **Add stages**: Edit `STAGE_OPTIONS`  
- **Add team members**: Edit `ASSIGNEES`
- **Change colours**: Edit CSS variables in `client/src/index.css`
- **Database location**: Set `DB_PATH` in `.env`
