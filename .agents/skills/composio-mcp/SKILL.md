---
name: composio-mcp
description: Connect and orchestrate 250+ tools (Gmail, Google Calendar, Outlook, Slack, GitHub, WhatsApp, TikTok Ads) using Composio's Model Context Protocol (MCP) server (https://connect.composio.dev/mcp) and Composio SDK. Use when connecting external apps, configuring MCP servers, calling Composio tools, handling OAuth single sign-on, or managing multi-app agent integrations.
---

# Composio MCP & App Integrations Skill

Composio enables AI agents to connect to 250+ software tools and services through the **Model Context Protocol (MCP)** and native SDK actions.

## 1. Connecting Composio via Model Context Protocol (MCP)

The sanctioned, standard way to connect Composio tools to any MCP client (Antigravity, Cursor, Claude Desktop) is through the **Composio Connect MCP server**.

### `.mcp.json` Project Configuration
Add the remote HTTP MCP block to your project root `.mcp.json`:

```json
{
  "mcpServers": {
    "composio": {
      "type": "http",
      "url": "https://connect.composio.dev/mcp"
    }
  }
}
```

### Authentication Flow
1. Navigate to **Composio Connect**: [https://connect.composio.dev/mcp](https://connect.composio.dev/mcp).
2. Sign in with your Composio account credentials.
3. Authenticate the integrations you need for your workspace:
   - **Gmail / Google Workspace**: Read, draft, and dispatch emails, attachments, and RFQs.
   - **Google Calendar / Outlook**: Manage appointments, scheduling, and invites.
   - **Slack / Discord**: Team notification channels and ops alerts.
   - **GitHub / GitLab**: Issues, pull requests, repository telemetry.
   - **Social Platforms (Meta, TikTok Ads)**: Ad campaigns, viral video concepts, lead capture.
4. Once authenticated in Composio Connect, all authorized tools are automatically advertised to the agent via `tools/list` without needing manual API key headers.

---

## 2. Programmatic Integration via `@composio/core`

When running backend actions in Next.js, Node.js, or Convex:

### Initialization
```typescript
import { Composio } from "@composio/core";

const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  allowTracking: false,
});
```

### Creating an MCP Session
Create dynamic, per-user or per-workspace MCP sessions:

```typescript
const session = await composio.sessions.create("autopulse_workspace", {
  toolkits: ["gmail", "outlook", "facebook", "instagram", "tiktok"],
  manageConnections: true,
  mcp: true,
});

console.log("MCP Endpoint URL:", session.mcp.url);
```

### Authorizing App Connections via OAuth
```typescript
// Generate interactive OAuth link for user to authorize Gmail without password:
const connectionRequest = await composio.toolkits.authorize(
  "autopulse_workspace",
  "gmail",
  { callbackUrl: "http://localhost:3000/dashboard/integrations" }
);

if (connectionRequest.redirectUrl) {
  // Open connectionRequest.redirectUrl in popup or tab
}
```

---

## 3. Resolving 401 `APIKey_InvalidAPIKey` Errors

If Composio returns `401 {"error": {"code": 801, "slug": "APIKey_InvalidAPIKey"}}`:
1. The stored key in `.env.local` or Convex deployment environment has been rotated, revoked, or belongs to a different Composio organization.
2. Obtain the active key from [Composio Settings](https://app.composio.dev/settings).
3. Update both environments:
   - Next.js: `.env.local` -> `COMPOSIO_API_KEY=ck_...`
   - Convex: `npx convex env set COMPOSIO_API_KEY ck_...`
4. Alternatively, use the **Composio Connect MCP** gateway (`https://connect.composio.dev/mcp`) which handles authentication directly in the browser via Composio Single Sign-On.

---

## 4. Multi-App Architecture Pattern

```
+-------------------------------------------------------------+
|                  AI Agent / Chat Interface                  |
+------------------------------+------------------------------+
                               |
            +------------------+------------------+
            |                                     |
+-----------v------------+              +---------v---------+
|  Composio MCP Server   |              | Convex CRM Action |
| (connect.composio.dev) |              |  (Whapi / Direct) |
+-----------+------------+              +---------+---------+
            |                                     |
   +--------+--------+                            |
   |        |        |                            |
+--v---+ +--v---+ +--v----+                 +-----v-----+
|Gmail | |Slack | |TikTok |                 | WhatsApp  |
| API  | | API  | |  Ads  |                 |  (Whapi)  |
+------+ +------+ +-------+                 +-----------+
```
