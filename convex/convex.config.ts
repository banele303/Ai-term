import agent from "@convex-dev/agent/convex.config"
import { defineApp } from "convex/server"

const app = defineApp()

// Stateful agent threads, messages and vector memory
app.use(agent)

export default app
