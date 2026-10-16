import { NextResponse } from "next/server";
import { demoMode, enrollSpeaker } from "@/lib/detectifai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (demoMode()) return NextResponse.json({ error: "Demo enrollment is saved in this browser and does not call DetectifAI." }, { status: 400 });
    const form = await request.formData();
    const file = form.get("referenceAudio");
    const speakerId = String(form.get("speakerId") || "");
    const displayName = String(form.get("displayName") || "");
    const key = String(form.get("idempotencyKey") || crypto.randomUUID());
    if (!(file instanceof File)) return NextResponse.json({ error: "A reference voice recording is required." }, { status: 400 });
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(speakerId)) return NextResponse.json({ error: "speakerId must be 1–64 letters, numbers, underscores, dots, colons, or hyphens." }, { status: 400 });
    const result = await enrollSpeaker(file, speakerId, displayName, key);
    return NextResponse.json({ ...result, mode: "live" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice enrollment failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
