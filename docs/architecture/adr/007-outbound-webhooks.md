# ADR-007: Outbound webhooks (HMAC, fire-and-forget)

**Date:** 2026-04-26
**Status:** Accepted
**Deciders:** Tom

## Context

Every mutation in Holocron logs an `:Event` node. External systems (alerting, analytics, governance pipelines) need to react to those events without polling. We need:

- A way for receivers to subscribe by event topic.
- Authenticity (the receiver should be able to verify the request came from Holocron).
- Reasonable failure handling (don't melt the API if a receiver is down).
- A test path so receivers can validate their integration without waiting for real events.

## Decision

Implement outbound webhooks as a first-class entity with HMAC-SHA256 signing and fire-and-forget dispatch:

1. **`:Webhook` nodes** with `url`, `events` (list of `<entity>.<action>` topics or `*`), `secret` (HMAC key), `description`, `disabled`, `failure_count`, `last_error`, `last_fired_at`.
2. **CRUD via `/api/v1/webhooks`** — create returns the secret **once**; subsequent reads never expose it.
3. **Fan-out at event time.** When `event_service.log()` writes an `:Event`, it triggers `webhook_dispatcher.dispatch_event(event)` which iterates matching subscribers and dispatches each in an `asyncio.create_task()`. The mutation request returns immediately.
4. **HMAC-SHA256 over the raw body**, sent in `X-Holocron-Signature: sha256=<hex>`. Topic in `X-Holocron-Topic`, event UID in `X-Holocron-Event-Uid`. `User-Agent: holocron-webhooks/0.1`.
5. **Bounded concurrency.** Process-wide `asyncio.Semaphore(100)` caps in-flight deliveries.
6. **Auto-disable.** After 10 consecutive failures the webhook is disabled. Re-enable via `PUT {"disabled": false}`, which also resets the counter.
7. **No persistent retry queue (v0.1).** A failed delivery is not retried beyond the immediate attempt. Receivers handle eventual consistency by reconciling against `GET /events`.
8. **Test endpoint.** `POST /webhooks/{uid}/test` fires a synthetic event with `metadata.test=true` and returns `{"delivered": true|false}`.

## Options considered

### 1. Polling

- **Pros:** trivial — receivers GET `/events?since=...`.
- **Cons:** chatty, latency floor = poll interval, can't push to slack/pagerduty cleanly.

### 2. Webhooks with persistent retry queue

- **Pros:** robust against transient receiver failures.
- **Cons:** introduces a queue (Redis / Postgres / RabbitMQ) — extra service to operate. Premature for the current scale.

### 3. Push to a message broker (Kafka / NATS)

- **Pros:** scales horizontally, fan-out is the broker's problem.
- **Cons:** receivers must speak the broker protocol, extra infrastructure, very different operational model.

### 4. Outbound HTTP webhooks with HMAC, fire-and-forget ✅ Selected

- **Pros:** zero extra infrastructure; receivers only need an HTTP endpoint and a shared secret; HMAC gives authenticity without TLS-only solutions.
- **Cons:** transient failures lose events (mitigated by `/events` reconciliation); secrets stored plaintext (mitigated by treating the DB as sensitive).

## Rationale

Webhooks are the lowest-friction option for receivers — every alerting / governance / orchestration tool understands a signed POST. Fire-and-forget keeps the API responsive: we never block a write on a slow receiver. HMAC over the raw body is the standard pattern (Stripe, GitHub, ...), familiar to anyone integrating webhooks before.

A persistent retry queue is the obvious next step but adds a service. It can be added later without changing the wire contract — receivers wouldn't notice. For now, "if you missed an event, replay from `/events`" is the documented path.

The 10-failure auto-disable threshold protects the API from wasting effort on permanently-broken receivers. It's high enough to ride out transient outages and low enough that a typoed URL stops sending within a minute or so of meaningful traffic.

## Consequences

### Positive

- Zero extra infrastructure.
- Standard HMAC pattern, easy to integrate.
- Mutations never block on receivers.
- Bad receivers self-disable.

### Negative

- Failed deliveries aren't retried (in v0.1).
- Secrets are stored plaintext in Neo4j (the dispatcher needs them to sign).
- No delivery ordering guarantees across receivers.
- The semaphore is per-process; multiple workers don't share a global concurrency cap.

### Mitigations

- Document `/events` as the reconciliation path.
- Treat the Neo4j database as sensitive (it always was — owners and metadata live there too).
- If at-least-once delivery becomes a requirement, add a persistent queue without changing the wire contract.

## References

- Public reference: [docs/webhooks.md](../../webhooks.md)
- Routes: `packages/api/src/holocron/api/routes/webhooks.py`
- Dispatcher: `packages/api/src/holocron/core/services/webhook_dispatcher.py`
- Repository: `packages/api/src/holocron/db/repositories/webhook_repo.py`
- Tests: `packages/api/tests/unit/test_webhooks.py`
