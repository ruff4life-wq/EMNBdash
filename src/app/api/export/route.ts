import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Cloud export sync is reserved for Phase 3." },
    { status: 501 },
  );
}
