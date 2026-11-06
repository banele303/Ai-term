import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"

const crons = cronJobs()

// Convex crons run in UTC. 07:00 UTC = 09:00 SAST.
// Each job checks its toggle in the automation library before doing anything.
crons.cron(
  "workshop re-engagement",
  "0 7 * * *",
  internal.automations.reengageWorkshops,
  {}
)

crons.cron("ad metrics sync", "15 * * * *", internal.composioTools.syncAdCampaigns, {})

export default crons
