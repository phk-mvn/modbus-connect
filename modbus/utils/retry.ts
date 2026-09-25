// modbus/utils/retry.ts

/**
 * Universal retry mechanism with configurable backoff policies,
 * jitter, and cancellation-aware interruptible delays.
 */

import { ModbusFlushError } from '../core/errors.js';

/**
 * Signal error indicating that the retry sequence was interrupted
 * (e.g., task was stopped/paused or an AbortSignal was triggered).
 * Thrown by `runWithRetries` so callers can distinguish between an external abort
 * and natural exhaustion of allowed retry attempts.
 */
export class RetryAbortedError extends Error {
  /**
   * Creates a new RetryAbortedError.
   *
   * @param message - Descriptive message explaining why retry was aborted (default: 'Retry was aborted').
   */
  constructor(message: string = 'Retry was aborted') {
    super(message);
    this.name = 'RetryAbortedError';
  }
}

/**
 * Configuration contract defining a retry policy.
 * Unifies retry handling across ModbusClient requests and PollingManager tasks.
 */
export interface IRetryPolicy {
  /**
   * Number of retries allowed after the first attempt fails (0 = single attempt only).
   */
  maxRetries: number;

  /**
   * Computes the pause duration in milliseconds before retry attempt #`retryNumber` (1-based index).
   *
   * @param error - The error that caused the previous attempt to fail.
   * @param retryNumber - The upcoming retry index (1-based: 1, 2, 3...).
   * @returns Delay in milliseconds before attempting the next retry.
   */
  getDelayMs: (error: unknown, retryNumber: number) => number;

  /**
   * Optional predicate determining whether an error is eligible for retry.
   * If omitted, all errors are retried up to maxRetries.
   *
   * @param error - The error encountered.
   * @param retryNumber - The upcoming retry index.
   * @returns True if the error should be retried, false to fail fast immediately.
   */
  shouldRetry?: (error: unknown, retryNumber: number) => boolean;

  /**
   * Callback invoked immediately after each failed attempt BEFORE the retry delay pause.
   *
   * @param error - The error that caused the failure.
   * @param attemptNumber - The attempt index that just failed (1-based).
   * @returns void
   */
  onAttemptFailed?: (error: unknown, attemptNumber: number) => void;

  /**
   * Callback invoked when all retry attempts have been exhausted, right before re-throwing the final error.
   *
   * @param error - The last encountered error.
   * @param attempts - Total number of attempts executed.
   * @returns void
   */
  onExhausted?: (error: unknown, attempts: number) => void;

  /**
   * Optional external AbortSignal to cancel waiting and abort further attempts.
   */
  signal?: AbortSignal;

  /**
   * Optional predicate periodically evaluated to detect whether task has been stopped or paused.
   *
   * @returns True if execution should immediately halt, false otherwise.
   */
  shouldStop?: () => boolean;

  /**
   * Polling frequency in milliseconds for evaluating `shouldStop` during sleep delays (default: 100).
   */
  checkIntervalMs?: number;
}

/**
 * Delays execution for a specified duration in an interruptible manner.
 * Wakes up immediately if an external AbortSignal fires or `shouldStop()` returns true,
 * ensuring no dangling timer handles remain.
 *
 * @param ms - Sleep duration in milliseconds.
 * @param options - Cancellation hooks and check interval settings.
 * @param options.signal - External AbortSignal to interrupt the pause.
 * @param options.shouldStop - Predicate function checked periodically during the delay.
 * @param options.checkIntervalMs - Interval in milliseconds between `shouldStop` checks (default: 100).
 * @returns A Promise resolving when the sleep duration finishes or when aborted early.
 */
export async function interruptibleSleep(
  ms: number,
  options: { signal?: AbortSignal; shouldStop?: () => boolean; checkIntervalMs?: number } = {}
): Promise<void> {
  const { signal, shouldStop, checkIntervalMs = 100 } = options;

  if (ms <= 0) return;
  if (signal?.aborted || shouldStop?.()) return;

  await new Promise<void>(resolve => {
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(mainTimer);
      if (checkInterval) clearInterval(checkInterval);
      signal?.removeEventListener('abort', onAbort);
    };

    const finish = () => {
      cleanup();
      resolve();
    };

    const mainTimer = setTimeout(finish, ms);
    const onAbort = () => finish();
    signal?.addEventListener('abort', onAbort, { once: true });

    const checkInterval: NodeJS.Timeout | null = shouldStop
      ? setInterval(() => {
          if (shouldStop()) finish();
        }, checkIntervalMs)
      : null;
  });
}

/**
 * Executes an asynchronous function according to the specified retry policy.
 * Resolves with the result of the first successful execution attempt.
 *
 * @template T - Return type of the executed attempt function.
 * @param attempt - Function executing a single attempt, receiving the 1-based attemptNumber.
 * @param policy - Retry policy configuration governing attempts, delays, and abortion.
 * @returns A Promise resolving to the result of the first successful attempt.
 * @throws {RetryAbortedError} If operation is aborted via AbortSignal or shouldStop predicate.
 * @throws {unknown} The final caught error when all retry attempts are exhausted.
 */
export async function runWithRetries<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  policy: IRetryPolicy
): Promise<T> {
  let attemptNumber = 1;

  for (;;) {
    if (policy.shouldStop?.() || policy.signal?.aborted) throw new RetryAbortedError();

    try {
      return await attempt(attemptNumber);
    } catch (error) {
      if (error instanceof RetryAbortedError) throw error;
      if (policy.shouldStop?.() || policy.signal?.aborted) throw new RetryAbortedError();

      const canRetry =
        attemptNumber <= policy.maxRetries &&
        (policy.shouldRetry ? policy.shouldRetry(error, attemptNumber) : true);

      policy.onAttemptFailed?.(error, attemptNumber);

      if (!canRetry) {
        policy.onExhausted?.(error, attemptNumber);
        throw error;
      }

      const delay = policy.getDelayMs(error, attemptNumber);
      await interruptibleSleep(delay, {
        signal: policy.signal,
        shouldStop: policy.shouldStop,
        checkIntervalMs: policy.checkIntervalMs,
      });
      attemptNumber++;
    }
  }
}

/**
 * Fixed pause duration in milliseconds after a buffer flush error:
 * indicates that the bus is recovering and a long wait is unnecessary.
 */
export const FLUSH_ERROR_DELAY_MS = 50;

/**
 * Computes default retry delay incorporating exponential backoff and randomized jitter.
 * Handles buffer flush errors with a minimal fixed pause (`FLUSH_ERROR_DELAY_MS`).
 *
 * @param error - The caught error from the failed attempt.
 * @param retryNumber - The 1-based retry attempt number (1, 2, 3...).
 * @param baseDelayMs - Base delay interval in milliseconds.
 * @returns Calculated delay in milliseconds before the next retry attempt.
 */
export function defaultRetryDelay(
  error: unknown,
  retryNumber: number,
  baseDelayMs: number
): number {
  if (error instanceof ModbusFlushError) return FLUSH_ERROR_DELAY_MS;
  const base = baseDelayMs * Math.pow(2, retryNumber - 1);
  return base + Math.random() * base * 0.5;
}
