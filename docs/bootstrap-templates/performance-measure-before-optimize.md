# Performance work must start with measurement

*Signal: general · Tier: onDemand · Glob: —*
*Source: Anvil bootstrap template · Last validated: 2026-07-09*

## Why (Failure Mode)

AI coding agents often "optimize" from vibes: they add caches, memoization, batching, or query rewrites before anyone has measured the real bottleneck. That creates a second system to maintain without proving the original problem. The common failure mode is permanent complexity added for no user-visible gain, followed by a slower debugging loop when the real bottleneck shows up elsewhere.

The opposite failure also happens: agents notice an obviously hot path, but they change it without capturing a before/after signal, so the team cannot tell whether the change helped or regressed the system.

## The Rule

Treat performance work as evidence-backed maintenance, not speculative cleanup.

- Measure before optimizing — capture one concrete baseline first (latency, query count, bundle size, memory, CPU time, or build time)
- Optimize the dominant bottleneck, not every suspicious line
- Keep the first change reversible — prefer the smallest change that can prove or disprove the hypothesis
- Re-measure after the change with the same signal and record the delta
- Remove or avoid "just in case" caches, memoization, or concurrency if no measurement shows they help

## Examples

### ✅ DO

```text
Performance investigation:
- Baseline: checkout endpoint p95 = 840 ms over the last 200 requests
- Suspected bottleneck: duplicate product queries inside cart enrichment
- Change: collapse N+1 fetches into one batched query
- Recheck: checkout endpoint p95 = 430 ms with identical payload size
```

```typescript
// Small, measurable change with before/after verification
const startedAt = performance.now();
const order = await loadOrderWithItems(orderId);
logger.info("order.load.duration_ms", {
  orderId,
  durationMs: performance.now() - startedAt,
});
```

### ❌ DON'T

```typescript
// Added from instinct, not evidence
const expensiveValue = useMemo(() => computeDashboard(data), [data]);

// No baseline, no measured hotspot, no proof this helps
```

```text
"Optimized performance across the app"
```

Without a baseline, target, and recheck number, that statement is not trustworthy.

## Scope

Tier: on-demand | Use when the task mentions performance, speed, latency, slow queries, bundle size, memory, caching, optimization, or build time

## See Also

- `docs/rubric.md` — scoring standards for evidence-backed rules
- `docs/bootstrap-templates/testing-patterns.md` — pair performance changes with regression tests when the bottleneck sits in business logic
- Research Digest #14 — token and context costs are measurable performance constraints, not vibes
