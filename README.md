# VoicePay Shield

VoicePay Shield is an institutional treasury control MVP for banks, public-sector organizations, and large enterprises. It focuses on high-value transfers (demo floor: INR 50 lakh), binding an approver voice check to the paying legal entity, beneficiary, transfer ID, and amount. DetectifAI deepfake detection and speaker verification produce an approval, block, or manual-review signal before an institution releases a transfer.

## Requirements

- Node.js 20.9 or newer
- npm

## Run locally

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `.env.local` is read by the server and must not be committed.

### Two-minute demo

1. Create an institutional transfer request of at least INR 50 lakh and enter the paying legal entity and beneficiary.
2. On the approval screen, record a short sample or choose an audio file.
3. Pick a demo scenario: genuine approver, different speaker, synthetic voice, or low confidence.
4. Click **Verify and approve payment** to show the decision card and updated audit log.
5. Open **Approver enrolment** to register a consented treasury approver voice. The browser keeps demo payment history and approver audio in local storage.

Demo mode is clearly marked in the interface. It is intended for local UI demonstrations and uses simulated scores; demo mode does not call DetectifAI. Demo and live payment histories use separate browser storage keys.

## DetectifAI configuration

The real integration follows DetectifAI's documented REST contract. Start with `DEMO_MODE=true` while you are trying the UI. In the DetectifAI dashboard, create a server-side API key with `deepfake:detect`, `speakers:enroll`, and `speakers:verify` scopes, then add it to `.env.local`. Adding a key automatically disables mock results; setting `DEMO_MODE=false` also selects live mode.

```dotenv
DEMO_MODE=false
DETECTIFAI_API_KEY=your_server_side_key
DETECTIFAI_API_BASE_URL=https://platform.detectif.ai/v1
DEEPFAKE_REVIEW_THRESHOLD=0.62
SPEAKER_MATCH_MIN_SCORE=0.53
DECISION_REVIEW_MARGIN=0.08
```

The server calls `POST /deepfake/detect` with the approval audio in multipart field `file`, and calls `POST /speakers/verify` with `file` and the approver's `speaker_id`. It enrolls a reference sample through `POST /speakers/enroll` with `file`, `speaker_id`, and `display_name`. Requests use bearer authentication and an `Idempotency-Key`. You can leave the three endpoint override variables blank; they default to the documented URLs under `DETECTIFAI_API_BASE_URL`.

In **Approver enrolment**, record or upload 15–60 seconds with at least 10 seconds of clear speech. Live enrollment sends that sample to DetectifAI and saves the returned speaker ID in the browser. Re-enrolling adds a sample to the same speaker. The provider allows up to five samples per speaker, and recommends samples from different sessions. Verification recordings need 3–60 seconds with at least 2 seconds of speech. Deepfake detection needs more than 4 seconds and accepts up to 120 seconds. The approval challenge asks for 5–10 seconds, enough for both checks.

The decision engine reads the documented `result.verdict` (`real`, `fake`, or `not_sure`) and `result.score` from deepfake detection, plus `result.decision`, `result.similarity`, and `result.threshold` from speaker verification. A `fake` verdict blocks; `not_sure` goes to manual review. DetectifAI says to make the deepfake decision from `verdict`, not score alone. Speaker similarity is a value from -1 to 1, not a percentage. Tune the app's speaker threshold to your provider/account policy; the documented example threshold is 0.53. Results near configured thresholds go to manual review.

```dotenv
DEEPFAKE_REVIEW_THRESHOLD=0.62
SPEAKER_MATCH_MIN_SCORE=0.53
DECISION_REVIEW_MARGIN=0.08
```

Live verification makes two billable checks, one deepfake request and one speaker verification request. Check the account's available credits first. Enroll and verification also require the corresponding API key scopes and a verified account.

### Check credits and usage

The key also needs `credits:read` and `usage:read` to call these read-only endpoints. In PowerShell, first load the key from `.env.local` into the current shell (this does not print it):

```powershell
$env:DETECTIF_API_KEY = (Select-String -Path .env.local -Pattern '^DETECTIFAI_API_KEY=(.*)$').Matches.Groups[1].Value
$headers = @{ Authorization = "Bearer $env:DETECTIF_API_KEY" }
Invoke-RestMethod -Uri 'https://platform.detectif.ai/v1/credits' -Headers $headers
Invoke-RestMethod -Uri 'https://platform.detectif.ai/v1/usage?limit=20' -Headers $headers |
  Select-Object -ExpandProperty data |
  Select-Object type, status, credits_charged, created_at
```

`GET /v1/credits` returns the available balance, credits reserved by checks in progress, and `price_per_operation`. `GET /v1/usage` shows the actual `credits_charged` per enrollment, deepfake detection, or speaker verification. This app makes two checks per payment approval; each successful check is charged separately. Enrollment is another operation. Failed or uncertain requests can have different charges, so use the returned usage data as the source of truth. Reuse the same `Idempotency-Key` when retrying the same upload; the app keeps each key for retries and clears it after a successful response.

## Deploy to Vercel

1. Import this repository into Vercel as a Next.js project (the framework and build settings are detected automatically).
2. Add `DEMO_MODE`, `DETECTIFAI_API_KEY`, the base URL, and desired thresholds in the project's server-side Environment Variables.
3. Set `DEMO_MODE=false` for a live integration deployment. Never use a `NEXT_PUBLIC_` prefix for provider secrets.
4. Deploy. The `/api/enroll` and `/api/verify` routes run in the Node.js runtime; credentials remain server-side.

Local demo records and enrolled reference audio live in that browser's local storage. They are not shared between devices or users. This MVP does not implement institutional identity verification, SSO, role-based access, multi-person maker-checker approval, persistent server storage, bank integration, or payment transfer. The INR 50 lakh floor is a product-demo guardrail; production institutions must set their own limits and enforce them server-side against their treasury policy. Voice results are an additional risk signal and do not release funds.

## Stack

- Next.js App Router and TypeScript
- Tailwind CSS plus custom responsive styles
- Browser `MediaRecorder` API with audio upload fallback
- Server-side verification API route and configurable decision thresholds
- Local browser storage for demo records
