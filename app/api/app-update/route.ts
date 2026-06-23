import { NextResponse } from "next/server";
import { getCurrentAppUpdateManifest } from "@/lib/appUpdateManifest";

export async function GET() {
  return NextResponse.json(getCurrentAppUpdateManifest(), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
