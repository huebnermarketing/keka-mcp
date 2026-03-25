# keka-mcp-server

MCP server for the [Keka HRM](https://www.keka.com) API, built for White Label IQ (WLIQ).

Exposes 16 tools covering Keka's core modules so Claude (or any MCP client) can query and act on HR data.

---

## Tools

### HRIS
| Tool | Description |
|---|---|
| `keka_list_employees` | List employees with filters (status, search, probation, etc.) |
| `keka_get_employee` | Get full details for a single employee by ID |
| `keka_list_departments` | List all departments |
| `keka_list_job_titles` | List all job titles |
| `keka_list_groups` | List all groups/teams |

### Leave Management
| Tool | Description |
|---|---|
| `keka_list_leave_types` | List configured leave types (Annual, Sick, etc.) |
| `keka_list_leave_requests` | List leave requests with date/employee filters |
| `keka_create_leave_request` | Submit a new leave request for an employee |
| `keka_get_leave_balances` | Get leave balance breakdown per employee |

### Attendance
| Tool | Description |
|---|---|
| `keka_get_attendance` | Get attendance records (clock-in/out, hours, status) |

### Payroll
| Tool | Description |
|---|---|
| `keka_list_pay_groups` | List payroll groups |
| `keka_list_pay_bands` | List salary pay bands |
| `keka_list_salaries` | List employee salaries (CTC, pay group) |

### Expense
| Tool | Description |
|---|---|
| `keka_list_expenses` | List individual expenses for an employee |
| `keka_list_expense_claims` | List all expense claims across employees |

### Recruitment (Keka Hire)
| Tool | Description |
|---|---|
| `keka_list_jobs` | List job openings |
| `keka_list_candidates` | List candidates for a specific job |

### PSA
| Tool | Description |
|---|---|
| `keka_list_psa_clients` | List PSA clients |
| `keka_list_psa_projects` | List PSA projects |

---

## Setup

### 1. Get Keka API credentials

In your Keka admin portal:
1. Go to **Settings → Integrations → API**
2. Create a new API access key
3. Note down: `Client ID`, `Client Secret`, `API Key`

### 2. Install dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

### 4. Environment variables

| Variable | Required | Description |
|---|---|---|
| `KEKA_BASE_URL` | ✅ | Your Keka tenant URL, e.g. `https://yourcompany.keka.com` |
| `KEKA_CLIENT_ID` | ✅ | OAuth2 Client ID from Keka admin |
| `KEKA_CLIENT_SECRET` | ✅ | OAuth2 Client Secret |
| `KEKA_API_KEY` | ✅ | API key from Keka admin |
| `KEKA_SANDBOX` | Optional | Set to `true` to use `kekademo.com` sandbox auth |
| `TRANSPORT` | Optional | `stdio` (default) or `http` |
| `PORT` | Optional | HTTP port when `TRANSPORT=http` (default: `3000`) |

---

## Claude Desktop integration (stdio)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "keka": {
      "command": "node",
      "args": ["/path/to/keka-mcp-server/dist/index.js"],
      "env": {
        "KEKA_BASE_URL": "https://yourcompany.keka.com",
        "KEKA_CLIENT_ID": "your-client-id",
        "KEKA_CLIENT_SECRET": "your-client-secret",
        "KEKA_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## HTTP mode (remote deployment)

```bash
TRANSPORT=http \
KEKA_BASE_URL=https://yourcompany.keka.com \
KEKA_CLIENT_ID=xxx \
KEKA_CLIENT_SECRET=xxx \
KEKA_API_KEY=xxx \
node dist/index.js
```

Health check: `GET http://localhost:3000/health`
MCP endpoint: `POST http://localhost:3000/mcp`

---

## Authentication

Keka uses a custom OAuth2 flow (`grant_type=kekaapi`). The server:
- Fetches a Bearer token on first request
- Caches the token in memory
- Auto-refreshes 2 minutes before expiry (tokens last 24 hours)

---

## Rate Limits

Keka enforces **50 requests per minute**. The server returns a clear error message if this limit is hit.

---

## Development

```bash
# Watch mode (no build required)
npm run dev

# Build
npm run build

# Start production
npm start
```
