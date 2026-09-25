/** AbortSignal by shape, so core needs neither the DOM lib nor the Node one. */
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

/** Transport only. Parsing stays in core, so a custom client cannot change what a valid intent is. */
export type HttpAdapter = {
  send(request: HttpRequest): Promise<HttpResponse>;
};
