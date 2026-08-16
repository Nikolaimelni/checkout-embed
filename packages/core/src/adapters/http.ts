/**
 * Structural stand-in for AbortSignal. A real one satisfies it, and taking the shape
 * rather than the type keeps DOM and Node lib definitions out of this package.
 */
export type AbortLike = {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
};

export type HttpRequest = {
  readonly method: 'GET' | 'POST';
  /** Relative to the configured API base. The adapter owns the origin. */
  readonly path: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Sent as Idempotency-Key. Required by the PSP on anything that moves money. */
  readonly idempotencyKey?: string;
  readonly signal?: AbortLike;
};

export type HttpResponse = {
  readonly status: number;
  readonly body: unknown;
};

/**
 * Transport only. Parsing lives in core, so a merchant swapping fetch for their own
 * client cannot accidentally change what counts as a valid payment intent.
 */
export type HttpAdapter = {
  send(request: HttpRequest): Promise<HttpResponse>;
};
