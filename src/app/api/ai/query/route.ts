import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { query, context } = await req.json();
  void query;
  void context;

  return NextResponse.json(
    { error: "AI query route is reserved for Phase 3." },
    { status: 501 },
  );
}
