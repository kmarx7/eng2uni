import { NextResponse } from "next/server";

// The admin review screen is local-only (stage 8): a production server answers
// 404 here, before any page streams a 200 shell.
export function proxy(): NextResponse {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not Found", { status: 404 });
  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
