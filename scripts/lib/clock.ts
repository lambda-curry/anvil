/**
 * Deterministic clock override for date-sensitive audit and drift checks.
 *
 * `ANVIL_FAKE_TODAY` (YYYY-MM-DD, UTC) pins "today" so fresh reruns can be
 * reproduced byte-for-byte against a checked-in packet regardless of the wall
 * clock. Unset, everything behaves as before.
 */
export function todayIso(): string {
  const override = process.env.ANVIL_FAKE_TODAY;
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
      throw new Error(
        `ANVIL_FAKE_TODAY must be YYYY-MM-DD, got: ${JSON.stringify(override)}`,
      );
    }
    return override;
  }
  return new Date().toISOString().split("T")[0];
}

export function todayEpochMs(): number {
  return new Date(`${todayIso()}T00:00:00Z`).getTime();
}
