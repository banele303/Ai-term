import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

// Safe lazy pool: does not crash when DATABASE_URL is not set (migrated to Convex)
let pool: Pool | undefined

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    if (!pool) {
      const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED
      if (!dbUrl) {
        console.warn("Neon DATABASE_URL is not set — data operations are running via Convex.")
        return () => Promise.resolve([])
      }
      pool = new Pool({ connectionString: dbUrl })
    }
    const realDb = drizzle({ client: pool, schema, casing: "snake_case" })
    return (realDb as any)[prop]
  },
})
