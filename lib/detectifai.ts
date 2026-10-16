import { randomUUID } from "node:crypto";

export type DeepfakeResult = {
  verdict: "real" | "fake" | "not_sure";
  isSynthetic: boolean;
  score: number;
  threshold: number;
  requestId?: string;
  operationId?: string;
};
export type SpeakerResult = {
  score: number;
  threshold: number;
  matches: boolean;
  requestId?: string;
  operationId?: string;
};

function apiKey() {
  const value = process.env.DETECTIFAI_API_KEY;
  if (!value)
    throw new Error("DETECTIFAI_API_KEY is not configured on the server.");
  return value;
}

function endpoint(variable: string, path: string) {
  return (
    process.env[variable] ||
    `${process.env.DETECTIFAI_API_BASE_URL || "https://platform.detectif.ai/v1"}${path}`
  );
}

async function postForm(url: string, form: FormData, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey()}`,
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(300_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      payload?.error?.message ||
      payload?.error?.code ||
      `HTTP ${response.status}`;
    const retry = response.headers.get("Retry-After");
    throw new Error(
      `DetectifAI: ${detail}${retry ? ` (retry after ${retry}s)` : ""}`,
    );
  }
  return payload;
}

export async function enrollSpeaker(
  audioFile: File,
  speakerId: string,
  displayName: string,
  idempotencyKey: string = randomUUID(),
) {
  const form = new FormData();
  form.append("file", audioFile, audioFile.name || "approver-reference.webm");
  form.append("speaker_id", speakerId);
  form.append("display_name", displayName);
  const raw = await postForm(
    endpoint("DETECTIFAI_SPEAKER_ENROLL_API_URL", "/speakers/enroll"),
    form,
    idempotencyKey,
  );
  if (!raw?.speaker?.speaker_id)
    throw new Error(
      "DetectifAI enrollment response did not include speaker.speaker_id.",
    );
  return {
    speakerId: String(raw.speaker.speaker_id),
    requestId: String(raw.request_id || ""),
    operationId: String(raw.operation_id || ""),
  };
}

export async function detectDeepfake(
  audioFile: File,
  idempotencyKey: string = randomUUID(),
): Promise<DeepfakeResult> {
  const form = new FormData();
  form.append("file", audioFile, audioFile.name || "approval.webm");
  const raw = await postForm(
    endpoint("DETECTIFAI_DEEPFAKE_API_URL", "/deepfake/detect"),
    form,
    idempotencyKey,
  );
  const result = raw?.result;
  const verdict = result?.verdict;
  const score = Number(result?.score);
  if (
    !["real", "fake", "not_sure"].includes(verdict) ||
    !Number.isFinite(score)
  )
    throw new Error(
      "DetectifAI deepfake response was missing result.verdict or result.score.",
    );
  return {
    verdict,
    isSynthetic: result.is_synthetic === true || verdict === "fake",
    score,
    threshold: Number(result.threshold) || 0.62,
    requestId: String(raw.request_id || ""),
    operationId: String(raw.operation_id || ""),
  };
}

export async function verifySpeaker(
  speakerId: string,
  audioFile: File,
  idempotencyKey: string = randomUUID(),
): Promise<SpeakerResult> {
  const form = new FormData();
  form.append("file", audioFile, audioFile.name || "approval.webm");
  form.append("speaker_id", speakerId);
  const raw = await postForm(
    endpoint("DETECTIFAI_SPEAKER_VERIFY_API_URL", "/speakers/verify"),
    form,
    idempotencyKey,
  );
  const result = raw?.result;
  const score = Number(result?.similarity);
  const threshold = Number(result?.threshold);
  if (
    !["match", "no_match"].includes(result?.decision) ||
    !Number.isFinite(score) ||
    !Number.isFinite(threshold)
  )
    throw new Error(
      "DetectifAI speaker response was missing result.decision, result.similarity, or result.threshold.",
    );
  return {
    score,
    threshold,
    matches: result.decision === "match",
    requestId: String(raw.request_id || ""),
    operationId: String(raw.operation_id || ""),
  };
}

export const demoMode = () =>
  process.env.DEMO_MODE === "true" && !process.env.DETECTIFAI_API_KEY;
