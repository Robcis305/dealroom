# Pitfalls Research

**Domain:** Secure document portal / deal room (Next.js + S3 + magic link auth)
**Researched:** 2026-04-12
**Confidence:** HIGH (security patterns are well-established; Next.js-specific items verified via AWS docs and CVE records)

## Critical Pitfalls

### Pitfall 1: Presigned URL Authorization Bypass via Missing Server-Side Permission Check

**What goes wrong:**
The API route generates a presigned S3 download URL for any authenticated user who requests it, without verifying that the user has folder-level access to the requested file. An authenticated user on Deal A can manipulate the file ID in the API request to download files from Deal B. This is the classic IDOR (Insecure Direct Object Reference) vulnerability -- the most dangerous pitfall for a deal room because it directly leaks confidential M&A documents to unauthorized parties.

**Why it happens:**
Developers treat "user is logged in" as sufficient authorization. The presigned URL itself is secure (time-limited, S3-scoped), so it feels safe. But the gate is the API route that *decides whether to generate the URL*, and that gate only checks authentication, not authorization. The S3 key structure (e.g., `deals/{dealId}/files/{fileId}`) is guessable or enumerable.

**How to avoid:**
Every file operation API route must enforce a three-step check before generating any presigned URL:
1. **Authenticate:** Verify session token is valid.
2. **Authorize deal membership:** Query `deal_participants` to confirm user belongs to the deal that owns the file.
3. **Authorize folder access:** Query `participant_folder_access` to confirm user has permission on the folder containing the file.

Implement this as a reusable middleware or utility function -- never inline authorization logic in individual route handlers. The query should be a single JOIN:

```sql
SELECT f.s3_key FROM files f
JOIN deal_participants dp ON dp.deal_id = f.deal_id
JOIN participant_folder_access pfa ON pfa.participant_id = dp.id AND pfa.folder_id = f.folder_id
WHERE f.id = :fileId AND dp.user_id = :userId AND dp.revoked_at IS NULL
```

If this query returns zero rows, return 403. Never return a presigned URL.

**Warning signs:**
- API route handler has no database query before calling `getSignedUrl()`.
- Tests pass file IDs directly without verifying cross-deal isolation.
- No integration tests that attempt cross-deal file access.

**Phase to address:**
Phase 1 (Auth + Core API). Authorization checks must be baked into the file access layer from day one. Retrofitting authorization is how data leaks happen.

---

### Pitfall 2: Magic Link Token Replay and Multi-Use Exploitation

**What goes wrong:**
A magic link token can be used multiple times. An attacker who intercepts a magic link (via email compromise, shoulder surfing, shared Slack channels, or browser history) can use it hours or days later to gain access. Since deal rooms contain confidential M&A documents, a single replayed token grants full access to the user's deals.

**Why it happens:**
The simplest magic link implementation stores a token in the database and checks if it exists + hasn't expired. But it never marks the token as "consumed" after first use. Or it marks it consumed in a separate step that can fail silently (non-atomic operation), leaving a window where the token remains valid.

**How to avoid:**
1. **Single-use enforcement via atomic consumption:** The token verification and invalidation must happen in a single atomic database operation:
   ```sql
   UPDATE magic_link_tokens
   SET consumed_at = NOW()
   WHERE token_hash = :hash AND consumed_at IS NULL AND expires_at > NOW()
   RETURNING user_id
   ```
   If zero rows affected, the token was already used or expired. This is immune to race conditions.

2. **Hash tokens in the database:** Store `SHA-256(token)` in the database, not the raw token. The URL contains the raw token; the database contains the hash. This prevents database compromise from yielding usable tokens.

3. **Short expiration:** 15 minutes max (not the 24 hours mentioned for sessions -- that's the session duration *after* successful login, not the token validity window).

4. **Rate-limit token generation:** Max 5 magic link requests per email per hour. Prevents brute-force token enumeration and email flooding.

5. **Invalidate all pending tokens on successful login:** When a user successfully authenticates with one magic link, invalidate all other outstanding tokens for that email.

**Warning signs:**
- Token table lacks a `consumed_at` column.
- Token verification uses SELECT then separate UPDATE (two queries, not atomic).
- Token expiry is set to the same duration as session expiry (conflating two different concepts).
- Raw tokens stored in database instead of hashes.

**Phase to address:**
Phase 1 (Auth). This is the first thing to build and must be correct before any other feature is tested. Get the token lifecycle wrong and everything downstream is compromised.

---

### Pitfall 3: Next.js Middleware-Only Authorization (CVE-2025-29927 Pattern)

**What goes wrong:**
Authorization is enforced only in Next.js middleware, not in API route handlers. In March 2025, CVE-2025-29927 revealed that Next.js middleware could be bypassed entirely by sending a crafted `x-middleware-subrequest` header. Any application relying solely on middleware for auth had all routes exposed. Even after the patch, the fundamental lesson stands: middleware is a convenience layer, not a security boundary.

**Why it happens:**
Next.js middleware feels like the right place for auth -- it runs before every request, it's centralized, and the docs show auth examples there. Developers assume "if middleware blocks it, the route handler doesn't need to check." This is defense-in-depth failure: a single bypass (CVE, misconfiguration, or route that doesn't match the middleware matcher) exposes everything.

**How to avoid:**
1. **Defense in depth:** Middleware provides a first-pass auth check (redirect unauthenticated users to login). But every API route handler and every Server Component that loads sensitive data MUST independently verify the session and authorization.

2. **Create a `requireAuth()` utility** that validates the session cookie and returns the authenticated user, or throws. Call it at the top of every API route and server action:
   ```typescript
   export async function GET(req: Request) {
     const user = await requireAuth(req); // throws 401 if invalid
     const deal = await requireDealAccess(user.id, dealId); // throws 403 if not member
     // ... proceed
   }
   ```

3. **Never rely on middleware matchers alone.** The `matcher` config in `middleware.ts` is an allowlist for which routes middleware runs on. A typo or missing pattern silently skips auth for new routes.

4. **Pin Next.js version and monitor security advisories.** The CVE-2025-29927 fix was in Next.js 14.2.25 / 15.2.3. Ensure you are on a patched version.

**Warning signs:**
- API routes that don't start with an auth check.
- Middleware is the only place that reads the session cookie.
- New API routes work without authentication in development (because middleware matcher doesn't cover them yet).

**Phase to address:**
Phase 1 (Auth). Establish the `requireAuth` / `requireDealAccess` pattern from the first API route. Every subsequent phase inherits correct authorization by using these utilities.

---

### Pitfall 4: S3 Bucket Exposure via Misconfigured Bucket Policy or Public ACL

**What goes wrong:**
The S3 bucket storing deal documents is accidentally made publicly accessible. All confidential M&A documents become downloadable by anyone with the bucket URL. This is catastrophic for a deal room.

**Why it happens:**
Three common causes:
1. During development, a developer enables "Block Public Access: OFF" to troubleshoot CORS or presigned URL issues and forgets to re-enable it.
2. A bucket policy grants `s3:GetObject` to `"Principal": "*"` (intended for a different bucket pattern, copy-pasted incorrectly).
3. Object ACLs are set to `public-read` during upload (some S3 SDK examples include this as a default).

**How to avoid:**
1. **Enable S3 Block Public Access at the account level** (not just bucket level). This is a backstop that prevents any bucket in the account from being made public, regardless of bucket policy or ACL.
   ```json
   {
     "BlockPublicAcls": true,
     "IgnorePublicAcls": true,
     "BlockPublicPolicy": true,
     "RestrictPublicBuckets": true
   }
   ```

2. **Use IAM credentials (not bucket policy) for presigned URL generation.** The application's IAM role should have scoped permissions (`s3:GetObject`, `s3:PutObject` on the specific bucket/prefix). No bucket policy granting public access is needed.

3. **Enable S3 server-side encryption (AES-256 or KMS)** as specified in the project constraints. Use a bucket policy that denies any `PutObject` request without encryption headers.

4. **Enable S3 access logging** to an audit bucket. Monitor for unexpected `GetObject` calls from unknown IPs.

5. **CORS configuration:** Lock `AllowedOrigins` to `https://yourdomain.com` only. Never use `*` in production.

**Warning signs:**
- S3 console shows "Public" badge on the bucket.
- Presigned URLs work without sending them through the application (someone tests a direct S3 URL and it works).
- Bucket policy contains `"Principal": "*"`.
- No Block Public Access settings visible in Terraform/IaC.

**Phase to address:**
Phase 1 (Infrastructure setup). The S3 bucket must be created with correct security settings before any file is uploaded. This is infrastructure, not application logic -- set it once and verify.

---

### Pitfall 5: Session Revocation Fails to Invalidate Active Sessions

**What goes wrong:**
An admin revokes a participant's access to a deal, but the participant's existing browser session still works. They can continue downloading documents for the remainder of their session (up to 24 hours per the spec). In the worst case, a removed participant bulk-downloads sensitive files before the session naturally expires.

**Why it happens:**
JWTs are stateless by design. If session data is stored in a JWT cookie, revoking access in the database doesn't affect the token -- the token is self-contained and still valid until it expires. The application checks the JWT signature but never checks the database to confirm the user still has access.

**How to avoid:**
1. **Use database-backed sessions, not pure JWTs for authorization data.** Store a session ID in the cookie. On each request, look up the session in the database to get the user's current permissions. This is the only way to guarantee that revocation is immediate.

2. **If using JWTs:** Keep token lifetime short (15 minutes) and implement a refresh token flow. On each refresh, check the database. This creates a maximum 15-minute window of stale access, which may be acceptable.

3. **On participant revocation:**
   - Set `revoked_at` timestamp on the `deal_participants` record.
   - Invalidate all active sessions for that user (delete from sessions table, or add to a deny-list).
   - The `requireDealAccess` middleware must check `revoked_at IS NULL` on every request, not rely on cached permission data.

4. **Do not cache permissions in the session/cookie.** Always query current permissions from the database. The performance cost of one extra query per request is negligible compared to the security cost of stale permissions.

**Warning signs:**
- Session implementation uses a JWT with role/deal access embedded in claims.
- No database query happens between "session is valid" and "serve the file."
- Revocation test: remove a user and immediately test access in their browser -- it still works.

**Phase to address:**
Phase 1 (Auth + Session management). The session architecture decision (database-backed vs. JWT) must be made at the start. Changing from JWT to database sessions later requires rewriting all auth flows.

---

### Pitfall 6: Presigned Upload URL Allows Arbitrary File Type and Size

**What goes wrong:**
The presigned upload URL is generated without `Content-Type` or `Content-Length` conditions. An attacker uses the upload URL to push a 50GB file (DoS via storage costs), or uploads an executable/.html file that could be served as a drive-by download from S3. The spec limits files to 500MB and specific types (PDF, DOCX, etc.), but these limits are only enforced client-side.

**Why it happens:**
Presigned PUT URLs by default allow any content type and size. Developers validate file type in the React upload component (checking the file extension before upload) but forget that the presigned URL itself is the real upload mechanism -- a curl command with the presigned URL bypasses all client-side checks.

**How to avoid:**
1. **Set conditions on the presigned URL.** For presigned POST (recommended over PUT for uploads), use policy conditions:
   ```json
   {
     "conditions": [
       ["content-length-range", 0, 524288000],
       ["starts-with", "$Content-Type", "application/"],
       {"bucket": "your-bucket"},
       {"key": "deals/${dealId}/files/${fileId}"}
     ]
   }
   ```

2. **Validate file type server-side after upload.** Even with presigned URL conditions, implement a post-upload Lambda or webhook that:
   - Checks the actual file MIME type (magic bytes, not just extension).
   - Quarantines the file until validation passes.
   - Rejects and deletes non-conforming files.

3. **Set the S3 key server-side.** The presigned URL should specify the exact S3 key (including path prefix). Never let the client choose the key -- this prevents path traversal attacks where an attacker writes to an arbitrary location in the bucket.

4. **Apply S3 lifecycle policy** to delete incomplete multipart uploads after 24 hours (prevents storage cost accumulation from failed uploads).

**Warning signs:**
- Presigned URL generation code doesn't include `ContentType` or content length conditions.
- No server-side file validation exists -- the file goes from S3 directly to "available."
- Upload tests only use the UI, never test with curl/Postman against the raw presigned URL.

**Phase to address:**
Phase 2 (File upload/download). Must be correct at the same time file upload is implemented. Client-side validation is UX; server-side validation is security.

---

### Pitfall 7: Activity Log Gaps on Upload Failure or Partial Completion

**What goes wrong:**
The activity log records "file uploaded" only after the client reports successful upload. But if the upload fails mid-stream, or the client closes the browser after S3 upload completes but before the completion callback fires, the file exists in S3 but has no activity log entry and no database record. Orphaned files accumulate in S3. Conversely, if the log is written optimistically before upload completes, failed uploads appear as successful in the audit trail.

**Why it happens:**
Presigned URL uploads are a two-step process: (1) client gets URL from server, (2) client uploads directly to S3. The server has no built-in notification that step 2 completed. Developers log the event at step 1 (optimistic) or wait for the client to call back (unreliable).

**How to avoid:**
1. **Use S3 Event Notifications.** Configure the S3 bucket to send `s3:ObjectCreated:*` events to an SQS queue or Lambda function. This is the only reliable way to know a file actually landed in S3. The event triggers the server to:
   - Create/update the file record in the database.
   - Write the activity log entry.
   - Send email notifications.

2. **If S3 events are too complex for v1, use a two-phase logging approach:**
   - Log `upload_initiated` when the presigned URL is generated (with status "pending").
   - Client calls a `/api/files/confirm-upload` endpoint after successful upload.
   - A background job runs every 15 minutes to check for "pending" uploads older than 1 hour -- verify if the S3 object exists using `HeadObject`. Mark confirmed or failed accordingly.

3. **Track orphaned files.** Periodically reconcile S3 objects against database file records. Files in S3 without database records are orphans and should be quarantined/deleted.

**Warning signs:**
- Activity log writes happen in the same API route that generates presigned URLs (before upload occurs).
- No reconciliation job or S3 event listener exists.
- Manual S3 inspection reveals files not shown in the application.

**Phase to address:**
Phase 2 (File handling) for the basic two-phase approach. Phase 4 (Polish/hardening) for S3 event notifications if deferred.

---

### Pitfall 8: Permission Cache Staleness After Role Change or Folder Access Revocation

**What goes wrong:**
An admin changes a participant's role from "CIS Team" to "View Only" or removes their access to the "Financials" folder. But the application caches the participant's permissions (in-memory, Redis, or in the JWT), so the change doesn't take effect until the cache expires or the user's session refreshes. During this window, the user retains elevated access.

**Why it happens:**
Permission checks are expensive (multiple JOINs across `deal_participants`, `participant_folder_access`, and `roles`). Developers cache the result to avoid repeated database queries. The cache invalidation logic is either missing or only invalidates on logout, not on permission change.

**How to avoid:**
1. **Do not cache permissions for a deal room.** The number of concurrent users per deal is small (5-20 participants). A single JOIN query per request is fast enough and eliminates staleness entirely. Premature optimization of permission checks is the root cause of this bug.

2. **If caching is ever needed (it shouldn't be at this scale):** Invalidate the cache on every write to `deal_participants` or `participant_folder_access`. Use a version counter:
   - Store `permission_version` on each deal.
   - Increment on any permission change.
   - Cache includes the version number. If version mismatch, re-query.

3. **Server-side permission checks must query the database on every file access.** The `requireDealAccess` and `requireFolderAccess` utilities should always hit the database. There is no performance justification for caching at the expected scale (tens of users, not thousands).

**Warning signs:**
- Permission data stored in the session object or JWT claims.
- Any code path that reads permissions from somewhere other than the database.
- Admin changes a user's role and it "takes a while" to take effect.

**Phase to address:**
Phase 1 (Auth + Permissions). Establish the always-query pattern from the start. It's far harder to remove caching later than to never add it.

---

### Pitfall 9: Large File Upload Failure Without Resumability (500MB Limit)

**What goes wrong:**
Users attempt to upload files near the 500MB limit on unreliable connections. The upload fails at 80% and the user must restart from zero. After several failures, users abandon the portal and go back to emailing files -- defeating the product's core purpose.

**Why it happens:**
A standard presigned PUT URL sends the entire file in a single HTTP request. If the connection drops at any point, the entire upload is lost. At 500MB, even on a fast connection, uploads take several minutes. Mobile or hotel WiFi makes this a near-certainty for large files.

**How to avoid:**
1. **Use S3 multipart upload for files above 50MB.** The flow:
   - Server calls `CreateMultipartUpload` and returns an upload ID.
   - Server generates presigned URLs for each part (e.g., 10MB chunks).
   - Client uploads parts in parallel.
   - If a part fails, only that part needs to be retried.
   - Client calls server to `CompleteMultipartUpload`.

2. **Use a battle-tested upload library.** Libraries like `@uppy/aws-s3-multipart` or `evaporate.js` handle multipart uploads with retry, progress tracking, and pause/resume. Do not build this from scratch.

3. **Show upload progress.** A progress bar with percentage and speed estimate. For files over 10MB, show "X of Y MB uploaded." This is critical UX -- without progress indication, users assume the upload is frozen and close the tab.

4. **Set a per-part retry policy:** 3 retries with exponential backoff per chunk. Only fail the overall upload after all retries are exhausted.

**Warning signs:**
- Upload implementation uses a single `PutObject` presigned URL for all file sizes.
- No progress bar or progress indication during upload.
- QA testing only uses small files on fast connections.

**Phase to address:**
Phase 2 (File upload). Multipart upload should be the default path for files over ~50MB. Simple presigned PUT is fine for smaller files.

---

### Pitfall 10: Race Condition in File Versioning Overwrites Previous Version

**What goes wrong:**
Two participants upload a new version of the same document simultaneously. Both read the current version as "v3" and both write "v4". One overwrites the other. The lost version is never recoverable because both S3 keys targeted the same path. The activity log shows two "uploaded v4" events but only one file exists.

**Why it happens:**
Version numbering uses a read-then-write pattern: `SELECT MAX(version) FROM file_versions WHERE file_id = X`, then `INSERT ... version = max + 1`. Without proper locking, two concurrent requests both read the same max version and both increment to the same number.

**How to avoid:**
1. **Use a database-level unique constraint:** `UNIQUE(file_id, version_number)`. One of the two concurrent inserts will fail with a constraint violation. Catch this error and retry with the next version number.

2. **Use `INSERT ... SELECT MAX(version) + 1` as a single atomic statement:**
   ```sql
   INSERT INTO file_versions (file_id, version_number, s3_key, uploaded_by)
   SELECT :fileId, COALESCE(MAX(version_number), 0) + 1, :s3Key, :userId
   FROM file_versions WHERE file_id = :fileId
   ```
   This is atomic within a single statement but may still race under high concurrency. The unique constraint is the real safety net.

3. **Use UUIDs for S3 keys, not version numbers.** The S3 key should be `deals/{dealId}/files/{fileId}/{uuid}`, not `deals/{dealId}/files/{fileId}/v4`. This way, concurrent uploads never target the same S3 key. The version number is a database concept only.

4. **Enable S3 versioning on the bucket** as an additional safety net. Even if the application makes a mistake, S3 versioning preserves all versions of every object.

**Warning signs:**
- S3 key includes version number derived from application logic.
- File version insert is two separate queries (SELECT then INSERT).
- No unique constraint on `(file_id, version_number)`.

**Phase to address:**
Phase 2 (File versioning). Must be correct from the first implementation -- retroactively fixing lost versions is impossible.

---

### Pitfall 11: Client Name Leaked Through API Responses, Logs, or Error Messages

**What goes wrong:**
The spec requires that client names are visible only to admins. But the API returns the full deal object (including `client_name`) to all authenticated users, relying on the frontend to hide it. A non-admin participant opens browser DevTools, inspects the API response, and sees the confidential client name. In M&A, premature disclosure of a client name can kill a deal.

**Why it happens:**
The default pattern in most ORMs and API frameworks is to serialize the entire database record. Developers add `client_name` to the deal model, the API returns the full model, and the React component conditionally renders it. But the data is in the response payload regardless of rendering.

**How to avoid:**
1. **Filter at the API layer, not the UI layer.** Create separate response shapes per role:
   ```typescript
   function serializeDeal(deal: Deal, userRole: string) {
     const base = { id: deal.id, codename: deal.codename, status: deal.status };
     if (userRole === 'admin') {
       return { ...base, clientName: deal.clientName };
     }
     return base;
   }
   ```

2. **Audit all API responses** for fields that should be role-restricted. This includes error messages (e.g., "Deal for [Client Name] not found" in a 404 response).

3. **Audit server-side logs.** Do not log client names at INFO level. Use deal IDs or codenames in logs.

4. **Audit email notifications.** Ensure notification emails don't include client names unless the recipient is admin.

**Warning signs:**
- API routes return full database records without field filtering.
- `JSON.stringify(deal)` or ORM `.toJSON()` used directly in responses.
- Client name appears in browser Network tab for non-admin users.

**Phase to address:**
Phase 1 (Deal workspace API). The response serialization pattern must be established when deal endpoints are first built. Every subsequent endpoint inherits the pattern.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline auth checks (copy-paste per route) | Fast to write first routes | Auth logic diverges across routes; one route forgets a check | Never -- extract `requireAuth`/`requireDealAccess` from day one |
| Store raw magic link tokens in DB | Simpler implementation | DB breach = immediate account takeover for all pending tokens | Never -- hash tokens with SHA-256 |
| Single presigned PUT for all file sizes | Skip multipart upload complexity | Users on slow connections can't upload large files; support tickets | MVP only if all initial files are under 50MB |
| Client-side-only file type validation | Works for honest users | Malicious upload of executables, HTML, or oversized files via API | Never for a security-focused product |
| Log activity in the same request as the action | Simpler code, no async processing | Upload failures create inconsistent audit trail | MVP only if reconciliation job is planned for Phase 3+ |
| Use JWT with embedded permissions | No DB query per request for auth | Revocation has delay; permission changes not immediate | Never -- deal room scale doesn't justify caching |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AWS S3 | Creating presigned URLs with long-lived IAM user keys deployed in environment variables | Use IAM roles (on EC2/ECS) or scoped temporary credentials. For Vercel serverless, use environment variables with minimal-privilege IAM user scoped to one bucket. Rotate keys quarterly. |
| AWS S3 CORS | Setting `AllowedOrigins: ["*"]` during development and forgetting to restrict | Set CORS to exact production domain from the start. Use separate CORS rules for development (localhost) and strip them before deploy. |
| Resend (email) | Not handling email delivery failures -- magic link email bounces silently | Check Resend API response for errors. Display "check your spam folder" messaging. Implement retry for transient failures. Log all send attempts. |
| Resend (email) | Sending magic link URLs over HTTP (non-TLS email transport) | Magic links inherently travel over email (not encrypted end-to-end). Mitigate with short token expiry (15 min), single-use tokens, and rate limiting. Cannot fully prevent email interception -- this is an inherent limitation of magic links. |
| Supabase/Neon (Postgres) | Using Supabase Auth instead of custom magic link implementation | Supabase Auth has its own session management that may conflict with custom requirements (24-hour sessions, specific revocation behavior). Either use Supabase Auth fully or not at all -- don't mix. |
| Vercel | Assuming serverless functions have persistent state between invocations | Every invocation is stateless. Do not use in-memory caches, global variables for user state, or assume connection pooling persists. Use connection pooling via Neon/Supabase serverless drivers. |
| Vercel | Hitting the 4.5MB response body limit on serverless functions | File downloads must go through presigned URLs, never through the serverless function. Ensure no API route accidentally proxies file content through the function. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading full activity log on workspace open | Initial page load takes 3-5s for active deals | Paginate activity log. Load last 20 entries initially, lazy-load on scroll. | After ~200 activity entries per deal |
| N+1 queries on deal list home screen | Home screen slows down as user joins more deals | Use a single query with JOINs or subqueries for doc count, participant count, and last activity per deal. | After ~20 deals per user |
| Generating presigned URLs for all files in a folder at once | Folder with 100+ files takes seconds to load | Generate presigned download URLs on-demand (when user clicks download), not when listing files. List view needs only metadata, not download URLs. | After ~50 files per folder |
| Unindexed queries on activity log | Activity log queries slow down over deal lifetime | Index `activity_log(deal_id, created_at DESC)`. For file-specific activity, index `activity_log(file_id, created_at DESC)`. | After ~1000 log entries per deal |
| Database connection exhaustion on Vercel | Intermittent 500 errors under moderate load | Use a connection pooler (PgBouncer via Supabase, or Neon's serverless driver). Vercel spins up many concurrent function instances, each wanting a DB connection. | After ~20 concurrent users |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Presigned URL with no IP or time restriction | URL can be shared and used by anyone, from any network, until expiry | Keep expiry to 15 minutes (as specified). Consider adding `s3:signatureAge` bucket policy condition to enforce max age server-side. |
| Enumerable file/deal IDs (sequential integers) | Attacker increments IDs to probe for resources | Use UUIDs for all primary keys (as specified in constraints). Never expose sequential IDs in URLs or API responses. |
| No rate limiting on magic link endpoint | Attacker floods a victim's email or brute-forces token space | Rate limit to 5 requests per email per hour, 20 requests per IP per hour. Use Vercel's built-in rate limiting or implement via database counter. |
| Missing CSRF protection on state-changing API routes | Cross-site request forgery tricks authenticated users into performing actions | Use `SameSite=Strict` or `SameSite=Lax` on session cookies. For API routes that mutate state, verify the `Origin` header matches the portal domain. |
| Admin endpoints not restricted by role | Any authenticated user can create deals, invite participants, or delete folders | Implement role-based route guards. Admin actions (deal creation, participant management, folder management) must verify `role === 'admin'` in the route handler, not just in middleware. |
| Logging sensitive data in server logs | Cloud log providers (Vercel, Datadog) retain logs; sensitive data exposed to anyone with log access | Never log: magic link tokens, presigned URLs, client names, file contents. Log: user IDs, deal IDs (UUIDs), action types, timestamps. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No upload progress indicator | Users think the app is frozen during large file uploads, close the tab | Show a progress bar with percentage, file size, and estimated time. Keep progress visible even when navigating to other folders. |
| Silent permission denial | User clicks a folder they can't access and nothing happens | Show a clear "You don't have access to this folder" message. Better yet, hide folders the user can't access from the sidebar. |
| Magic link email delay not communicated | User clicks "Send magic link," nothing visible happens for 5-10 seconds, they click again and again | Show immediate "Magic link sent to your@email.com" confirmation. Add "Didn't receive it? Check spam or request a new link (available in 60 seconds)" messaging. |
| Download starts with no feedback | User clicks download on a 200MB file, nothing visible happens while the presigned URL is generated | Show "Preparing download..." state on the button, then trigger the browser download with the presigned URL. |
| Duplicate file detection is too aggressive | User uploads "Q3 Financials.pdf" and it warns about "Q3 Financials.pdf" from 3 months ago that's completely different | Duplicate detection should compare name + size + checksum, not just name. And it should warn, not block -- let the user choose to upload as a new version or a new file. |

## "Looks Done But Isn't" Checklist

- [ ] **Authentication:** Often missing token rotation -- verify that magic link tokens are single-use (atomic consumption) and session tokens rotate on sensitive actions.
- [ ] **File upload:** Often missing server-side type/size validation -- verify by uploading a `.exe` renamed to `.pdf` via curl to the presigned URL. The system should reject it post-upload.
- [ ] **Permission revocation:** Often missing immediate session invalidation -- verify by revoking a user's access and immediately testing their active session. Access should be denied on next request.
- [ ] **Activity log:** Often missing failure events -- verify that failed uploads, failed downloads (expired URLs), and failed permission checks are logged, not just successes.
- [ ] **Deal list:** Often missing access filtering -- verify that the deal list API only returns deals the user is a participant in, not all deals (another IDOR vector).
- [ ] **Presigned URLs:** Often missing from activity log -- verify that every presigned URL generation (both upload and download) is logged with the requesting user, file, and timestamp.
- [ ] **Email notifications:** Often missing error handling -- verify behavior when Resend API is down or email bounces. The upload should still succeed; the notification failure should be logged.
- [ ] **Folder deletion:** Often missing cascade handling -- verify that deleting a folder handles the files within it (either prevent deletion of non-empty folders, or move files to a default location).
- [ ] **Concurrent access:** Often untested -- verify that two users uploading to the same folder simultaneously don't cause race conditions in file numbering or database constraints.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| S3 bucket made public | HIGH | Immediately re-enable Block Public Access. Audit S3 access logs for unauthorized downloads. Notify affected deal participants. Consider all exposed documents compromised. |
| Magic link tokens compromised (DB breach) | MEDIUM if hashed, HIGH if raw | If hashed: rotate hash salt, invalidate all pending tokens, force new magic links. If raw: invalidate all sessions, notify all users, issue new magic links. |
| IDOR in file download API | HIGH | Fix the authorization check. Audit activity logs to identify any unauthorized downloads. Notify affected deal owners. Cannot un-download leaked files. |
| Orphaned files in S3 (no DB record) | LOW | Run reconciliation script comparing S3 objects to database records. Quarantine unmatched files for manual review. |
| Activity log gaps | MEDIUM | Cross-reference S3 access logs with activity log to identify missing events. Backfill from S3 logs where possible. Implement reconciliation going forward. |
| Permission escalation via stale cache | MEDIUM | Flush all permission caches. Switch to always-query pattern. Audit recent access logs for actions that occurred after revocation. |
| Client name leaked in API response | HIGH (M&A context) | Fix the API serialization immediately. Cannot un-leak the name. Notify the deal admin so they can assess impact. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| IDOR in presigned URL generation | Phase 1 (Auth + API) | Integration test: User A requests file from Deal B, gets 403 |
| Magic link token replay | Phase 1 (Auth) | Test: Use same magic link twice, second attempt fails |
| Middleware-only authorization | Phase 1 (Auth) | Test: Call API route directly without session cookie, gets 401; call with session but wrong deal, gets 403 |
| S3 bucket public exposure | Phase 1 (Infrastructure) | Verify Block Public Access enabled; attempt direct S3 URL access without presigned URL, gets 403 |
| Session revocation failure | Phase 1 (Auth) | Test: Revoke participant, immediately test their active session, gets 403 |
| Presigned upload without type/size constraints | Phase 2 (File upload) | Test: Upload .exe via curl to presigned URL, file is rejected or quarantined |
| Activity log gaps on upload failure | Phase 2 (File handling) | Test: Start upload, kill connection at 50%, verify log shows "upload_initiated" with pending status |
| Permission cache staleness | Phase 1 (Permissions) | Test: Change user role, immediately verify next API call reflects new role |
| Large file upload failure | Phase 2 (File upload) | Test: Upload 400MB file on throttled connection, verify resume works |
| File versioning race condition | Phase 2 (File versioning) | Test: Concurrent uploads of same file from two sessions, both succeed with unique version numbers |
| Client name data leak | Phase 1 (Deal API) | Test: Non-admin API response does not contain `client_name` field |

## Sources

- AWS S3 Presigned URL Documentation: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html (verified via WebFetch -- HIGH confidence)
- CVE-2025-29927: Next.js middleware authorization bypass (confirmed redirect to Vercel postmortem -- HIGH confidence, well-documented CVE)
- OWASP Forgot Password Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (MEDIUM confidence -- training data, not fetched)
- OWASP IDOR Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html (MEDIUM confidence -- training data)
- S3 Block Public Access: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html (MEDIUM confidence -- training data, well-established feature)
- S3 Multipart Upload: https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html (MEDIUM confidence -- training data, well-established feature)

---
*Pitfalls research for: CIS Deal Room -- secure document portal with Next.js + S3 + magic link auth*
*Researched: 2026-04-12*
