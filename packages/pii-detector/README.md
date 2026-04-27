# PII Detector 🔒

Holocron plugin that scans every schema field in the catalog and
classifies the ones that look like PII based on field-name patterns.

## How it classifies

Two confidence tiers, both purely name-driven (no data sampling):

- **High** — the name leaves no real ambiguity (`email`, `voiceprint`,
  `social_security`, `passport_number`, `password`, `dob`, …). A
  reviewer should accept these by default.
- **Medium** — the name *might* be PII depending on context (`name`,
  `address`, `country`, `ip_address`, `customer_id`). Always glance
  before applying — a column called `product_name` matches too.

Anything else is silently skipped. Each finding carries the matched
pattern label as `reason`, so the report explains itself.

## What it returns

A `SummaryResult` with:

- `counts` — `fields_scanned`, `candidates`, `high_confidence`,
  `medium_confidence`, `already_flagged`, `new_candidates`
- `samples` — up to 25 rows, prioritising high-confidence + not-yet-flagged
  findings (with full asset name, field path, confidence, and reason)
- `extra.note` — reminder that the plugin is read-only and how to apply
  flags via ⌘K

## Read-only by design

v1 doesn't mutate anything. After running the plugin, the reviewer uses
**⌘K → "Edit field → toggle PII"** on the schema editor to apply each
suggested flag manually. Auto-apply will likely come in a later version
once we have a confidence threshold + audit-trail story figured out.
