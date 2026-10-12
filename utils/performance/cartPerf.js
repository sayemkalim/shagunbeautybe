const { performance } = require("perf_hooks");

/**
 * Structured Performance Tracker for Cart Operations
 * Measures monotonic durations for each step in request lifecycle without logging sensitive data.
 */
class CartPerfTracker {
  constructor(operation, metadata = {}) {
    this.operation = operation;
    this.metadata = metadata;
    this.startTime = performance.now();
    this.timings = {};
    this.itemCount = metadata.itemCount ?? 0;
  }

  /**
   * Start measuring a named sub-step and return an end function.
   */
  startStep(stepName) {
    const t0 = performance.now();
    return () => {
      const duration = Number((performance.now() - t0).toFixed(2));
      this.timings[stepName] = duration;
      return duration;
    };
  }

  /**
   * Measure an async or sync callback and record duration.
   */
  async track(stepName, fn) {
    const end = this.startStep(stepName);
    try {
      return await fn();
    } finally {
      end();
    }
  }

  setItemCount(count) {
    this.itemCount = count;
  }

  record(stepName, durationMs) {
    this.timings[stepName] = Number(durationMs.toFixed(2));
  }

  /**
   * Finish tracking and log structured metrics.
   */
  end(extra = {}) {
    const totalDuration = Number((performance.now() - this.startTime).toFixed(2));
    const metrics = {
      tag: "CART_PERF",
      operation: this.operation,
      itemCount: this.itemCount,
      totalDurationMs: totalDuration,
      ...this.timings,
      ...extra,
    };

    // Safe structured logging - only operations, counts, and durations (no PII, tokens, or payment details)
    const timingParts = Object.entries(this.timings)
      .map(([k, v]) => `${k}=${v}ms`)
      .join(" ");

    console.log(
      `[CART_PERF] op=${this.operation} items=${this.itemCount} total=${totalDuration}ms ${timingParts}`
    );

    return metrics;
  }
}

module.exports = { CartPerfTracker };
