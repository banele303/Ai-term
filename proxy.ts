import { NextResponse, type NextRequest } from "next/server"

export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
