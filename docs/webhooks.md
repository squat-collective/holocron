# Webhooks

> Outbound events with HMAC-SHA256 signing, fire-and-forget dispatch, and auto-disable on failure.

Every mutation in Holocron logs an `:Event` node. Webhooks are subscribers: register a URL plus a list of event topics and you'll receive a signed POST whenever a matching event fires.

See [ADR-007](architecture/adr/007-outbound-webhooks.md) for the design choice.

## Endpoints

All under `/api/v1/webhooks`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhooks` | Register a subscriber. Returns the secret **once**. |
| `GET` | `/webhooks` | List subscribers (no secrets). |
| `GET` | `/webhooks/{uid}` | Get one subscriber. |
| `PUT` | `/webhooks/{uid}` | Update `url`, `events`, `description`, or `disabled`. Setting `disabled: false` clears the failure counter. |
| `DELETE` | `/webhooks/{uid}` | Unsubscribe. |
| `POST` | `/webhooks/{uid}/test` | Fire a synthetic test event. Returns `{"delivered": true|false}`. |

## Registering

```bash
curl -X POST http://localhost:8100/api/v1/webhooks \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://receiver.example.com/holocron",
    "events": ["asset.created", "asset.updated", "rule.created"],
    "description": "ops alert pipeline"
  }'
```

Use `["*"]` to receive every event.

The response includes the `secret` exactly once:

```json
{
  "uid": "wh-...",
  "url": "https://receiver.example.com/holocron",
  "events": ["asset.created", "asset.updated", "rule.created"],
  "description": "ops alert pipeline",
  "secret": "8jXfV...",   // <-- store this; the API will not show it again
  "created_at": "2026-04-26T10:32:11Z"
}
```

If you don't include `secret` in the request, the API generates one (32 bytes URL-safe base64). You can supply your own if you have key-management constraints.

## Event topics

A topic is `<entity>.<action>`:

| Entity | Actions |
|---|---|
| `asset` | `created`, `updated`, `deleted` |
| `actor` | `created`, `updated`, `deleted` |
| `relation` | `created`, `deleted` |
| `rule` | `created`, `updated`, `deleted` |

Subscribe to the wildcard `*` to receive everything (including future event kinds).

## Payload

```json
{
  "uid": "evt-...",
  "action": "updated",
  "entity_type": "asset",
  "entity_uid": "ast-...",
  "actor_uid": null,
  "timestamp": "2026-04-26T10:33:00Z",
  "changes": {
    "description": ["old", "new"],
    "status": ["draft", "active"]
  },
  "metadata": {}
}
```

`changes` is a per-field `[before, after]` map for `updated` events. For `created` and `deleted`, it's empty (the full entity state lives in the audit log; query `GET /events/{uid}` if you need it).

## Headers

Every dispatch carries:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `User-Agent` | `holocron-webhooks/0.1` |
| `X-Holocron-Topic` | e.g. `asset.updated` |
| `X-Holocron-Event-Uid` | matches `uid` in the body |
| `X-Holocron-Signature` | `sha256=<hex digest>` |

## Verifying the signature

The signature is HMAC-SHA256 over the raw request body, hex-encoded.

```python
import hmac, hashlib

def verify(secret: str, body: bytes, header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header)
```

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret: string, body: Buffer, header: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}
```

Always verify against the **raw** body. Re-serialising JSON before HMAC will produce a different digest.

## Delivery semantics

- **Fire-and-forget.** Dispatch happens in an `asyncio` background task; the API request that triggered the event returns as soon as the event is logged.
- **Bounded concurrency.** A process-wide `asyncio.Semaphore(100)` caps in-flight deliveries to prevent runaway tasks.
- **No persistent retry queue (v0.1).** A failure increments `failure_count` and stores `last_error` (truncated to 500 chars) but the event is **not** retried later. v0.2 may add a queue.
- **Auto-disable.** After 10 consecutive failures the webhook is disabled. Re-enable by `PUT`-ing `{"disabled": false}` (which also resets the counter).
- **HTTP timeout.** 10 seconds per delivery. A timeout counts as a failure.
- **Receiver responsibilities.** Respond `2xx` quickly. Idempotency is on you — duplicates are unlikely but not guaranteed (e.g. the API restarts mid-dispatch).

## Testing your receiver

```bash
curl -X POST http://localhost:8100/api/v1/webhooks/<uid>/test
# -> {"delivered": true}
```

The synthetic event has `entity_uid="webhook-test"` and `metadata.test=true` so you can route it to a test handler.

## Operational notes

- The `secret` is currently stored plaintext in Neo4j (the dispatcher needs it to sign). Treat the database as sensitive.
- Webhook deliveries are logged at INFO level when they succeed and at WARN when they fail. Look for `webhook_dispatcher` in the structured logs.
- Pruning old `:Event` nodes is your responsibility. They're append-only; no TTL is enforced.
