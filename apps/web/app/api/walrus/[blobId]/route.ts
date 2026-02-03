/**
 * Proxy Walrus image/blob from the backend so <img src="/api/walrus/xxx"> is same-origin.
 * Avoids CORS and mixed-content issues when the backend is on a different host/port.
 */

import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ blobId: string }> }
) {
  const { blobId } = await context.params;
  if (!blobId?.trim()) {
    return NextResponse.json({ error: "blobId required" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${API_URL}/walrus/${encodeURIComponent(blobId.trim())}`,
      { cache: "no-store" }
    );

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("[api/walrus] proxy error:", err);
    return new NextResponse(null, { status: 502 });
  }
}
