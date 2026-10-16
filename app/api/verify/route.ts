import { NextResponse } from "next/server";
import { demoMode, detectDeepfake, verifySpeaker } from "@/lib/detectifai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function threshold(name: string, fallback: number, min = 0, max = 1) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const verification = form.get("verificationAudio");
    const speakerId = String(form.get("speakerId") || "");
    if (!(verification instanceof File))
      return NextResponse.json(
        { error: "An approval recording is required." },
        { status: 400 },
      );

    let deepfake;
    let speaker;
    if (demoMode()) {
      const scenario = String(form.get("scenario") || "genuine");
      if (scenario === "synthetic") {
        deepfake = {
          verdict: "fake" as const,
          isSynthetic: true,
          score: 0.97,
          threshold: 0.62,
        };
        speaker = { score: 0.91, threshold: 0.53, matches: true };
      } else if (scenario === "mismatch") {
        deepfake = {
          verdict: "real" as const,
          isSynthetic: false,
          score: 0.06,
          threshold: 0.62,
        };
        speaker = { score: 0.31, threshold: 0.53, matches: false };
      } else if (scenario === "review") {
        deepfake = {
          verdict: "real" as const,
          isSynthetic: false,
          score: 0.59,
          threshold: 0.62,
        };
        speaker = { score: 0.5, threshold: 0.53, matches: false };
      } else {
        deepfake = {
          verdict: "real" as const,
          isSynthetic: false,
          score: 0.04,
          threshold: 0.62,
        };
        speaker = { score: 0.94, threshold: 0.53, matches: true };
      }
    } else {
      if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(speakerId))
        return NextResponse.json(
          {
            error:
              "The authorised approver has no valid DetectifAI speaker ID. Enrol their voice first.",
          },
          { status: 400 },
        );
      const deepfakeKey = String(
        form.get("deepfakeIdempotencyKey") || crypto.randomUUID(),
      );
      const speakerKey = String(
        form.get("speakerIdempotencyKey") || crypto.randomUUID(),
      );
      [deepfake, speaker] = await Promise.all([
        detectDeepfake(verification, deepfakeKey),
        verifySpeaker(speakerId, verification, speakerKey),
      ]);
    }

    const deepfakeLimit = threshold(
      "DEEPFAKE_CONFIDENCE_THRESHOLD",
      threshold("DEEPFAKE_REVIEW_THRESHOLD", deepfake.threshold, 0, 1),
      0,
      1,
    );
    const speakerLimit = threshold(
      "SPEAKER_MATCH_THRESHOLD",
      threshold("SPEAKER_MATCH_MIN_SCORE", speaker.threshold, -1, 1),
      -1,
      1,
    );
    const margin = threshold(
      "MANUAL_REVIEW_MARGIN",
      threshold("DECISION_REVIEW_MARGIN", 0.08, 0, 1),
      0,
      1,
    );
    let decision: "APPROVED" | "BLOCKED" | "MANUAL REVIEW";
    let reason: string;
    if (deepfake.verdict === "fake" || deepfake.isSynthetic) {
      decision = "BLOCKED";
      reason = "Synthetic voice detected";
    } else if (deepfake.verdict === "not_sure") {
      decision = "MANUAL REVIEW";
      reason =
        "Deepfake detection could not confidently classify this recording";
    } else if (
      Math.abs(deepfake.score - deepfakeLimit) <= margin ||
      Math.abs(speaker.score - speakerLimit) <= margin
    ) {
      decision = "MANUAL REVIEW";
      reason = "Verification confidence is low";
    } else if (!speaker.matches || speaker.score < speakerLimit) {
      decision = "BLOCKED";
      reason = "Voice does not match the authorised approver";
    } else {
      decision = "APPROVED";
      reason = "Voice is real and matches the authorised approver";
    }
    return NextResponse.json({
      decision,
      reason,
      deepfake,
      speaker,
      mode: demoMode() ? "demo" : "live",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
