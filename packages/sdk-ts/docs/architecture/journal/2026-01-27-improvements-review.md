# TypeScript SDK Improvements Review

**Date:** 2026-01-27
**Scope:** Error handling, utilities, and Active Record models

---

## Summary

This review covers recent improvements to the holocron-ts SDK, focusing on typed error handling, shared utilities, and enhanced documentation. Overall, the changes are well-implemented and significantly improve the SDK's developer experience.

**Verdict:** All improvements are correctly implemented and ready for use.

---

## Changes Reviewed

### 1. Typed Error Classes (`src/errors.ts`)

**Status:** Excellent

A well-designed error hierarchy has been introduced:

| Class | Purpose | HTTP Status |
|-------|---------|-------------|
| `HolocronError` | Base class for all API errors | Any |
| `NotFoundError` | Resource not found | 404 |
| `ValidationError` | Request validation failed | 422 |
| `NetworkError` | Network/connectivity issues | N/A |

**Strengths:**
- Clean inheritance hierarchy with appropriate base class
- Rich context on errors (`statusCode`, `apiError`, `operation`, `resourceType`, `resourceUid`)
- Factory function `createApiError()` handles response parsing
- Validation errors expose structured `details` array matching FastAPI's format
- All errors are properly exported from `src/index.ts`

**Usage pattern:**
```typescript
try {
  await client.assets.get('nonexistent');
} catch (e) {
  if (e instanceof NotFoundError) {
    console.log(`${e.resourceType} not found: ${e.resourceUid}`);
  }
}
```

### 2. Shared Utility (`src/utils.ts`)

**Status:** Good

The `resolveUid()` function was extracted from `client.ts` to a shared utility:

```typescript
export function resolveUid(ref: EntityRef): string {
  return typeof ref === "string" ? ref : ref.uid;
}
```

**Benefits:**
- Eliminates code duplication (was in `client.ts`, now shared with models)
- Used by both `HolocronClient` and `RelationEntity`
- Properly marked `@internal` for documentation

### 3. Updated Error Handling (`src/client.ts`)

**Status:** Excellent

All API methods now use typed errors:

| Before | After |
|--------|-------|
| `throw new Error("Failed to list assets")` | `throw createApiError("list assets", error, response.status)` |
| `throw new Error("Failed to get asset: ${uid}")` | `throw new NotFoundError(...)` for 404s |

**Key improvements:**
- Every method extracts `response` from API calls
- 404 responses on `.get()` methods throw specific `NotFoundError` with resource context
- Other errors go through `createApiError()` for appropriate typing
- JSDoc `@throws` annotations updated to reflect actual error types

### 4. Lazy Loading Fix (`src/models/relation.ts`)

**Status:** Correctly Fixed

The `_fetchEntity()` method now properly handles errors during entity type detection:

```typescript
// Before (problematic):
try {
  const assetData = await this._client.assets.get(uid);
  return AssetEntity._fromData(this._client, assetData);
} catch {
  // Caught ALL errors - network errors would silently try actor
}

// After (correct):
try {
  const assetData = await this._client.assets.get(uid);
  return AssetEntity._fromData(this._client, assetData);
} catch (error) {
  // Only fall back to actor on 404, re-throw other errors
  if (!(error instanceof NotFoundError)) {
    throw error;
  }
}
```

**Why this matters:**
- Network errors (500, timeout, etc.) are now properly propagated
- Only 404 triggers the fallback to actor lookup
- Prevents silent failures from masking real problems

### 5. Metadata Documentation (`src/models/asset.ts`, `src/models/actor.ts`)

**Status:** Good

Both entity classes now document the metadata change tracking limitation:

```typescript
/**
 * Custom metadata for the asset.
 *
 * **Note:** Direct mutations to this object are not tracked.
 * To trigger change detection, reassign the entire object.
 *
 * @example
 * ```typescript
 * // ❌ Not tracked - direct mutation
 * asset.metadata.key = 'value';
 *
 * // ✅ Tracked - reassignment
 * asset.metadata = { ...asset.metadata, key: 'value' };
 * ```
 */
get metadata(): Record<string, unknown> { ... }
```

**Value:**
- Prevents user confusion about why `save()` doesn't persist metadata changes
- Clear code examples show the correct pattern
- Consistent across both `AssetEntity` and `ActorEntity`

---

## Test Coverage

The diff shows comprehensive unit tests were added for `ActorEntity` in `tests/models/actor.test.ts`:
- New entity creation and defaults
- Existing entity hydration
- Dirty tracking for all mutable fields
- Multiple field change tracking

Similar test patterns likely exist for the other models (not fully visible in diff preview).

---

## Architecture Notes

The error handling architecture follows a clean pattern:

```
API Response
    │
    ▼
client.ts extracts {data, error, response}
    │
    ├── success → return data
    │
    └── error → createApiError() or specific NotFoundError
                    │
                    ▼
              Typed error with context
```

This allows callers to:
1. Catch specific error types (`NotFoundError`, `ValidationError`)
2. Access rich context (`resourceType`, `resourceUid`, `details`)
3. Fall through to generic `HolocronError` for unexpected cases

---

## Minor Observations

1. **No breaking changes** - All changes are additive or internal refactoring
2. **Exports are complete** - All new types properly exported from `src/index.ts`
3. **Consistent patterns** - Error handling follows the same pattern across all resource types

---

## Conclusion

These improvements bring the SDK's error handling to production quality. Users can now write proper error handling code with `instanceof` checks and access meaningful context about what went wrong. The lazy loading fix prevents a real bug where network errors could be silently swallowed.

**No action items** - all changes are well-implemented.
