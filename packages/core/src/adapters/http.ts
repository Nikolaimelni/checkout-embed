export type AbortLike = {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
};

export type HttpRequest = {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly idempotencyKey?: string;
  readonly signal?: AbortLike;
};

export type HttpResponse = {
  readonly status: number;
  readonly body: unknown;
};

export type HttpAdapter = {
  send(request: HttpRequest): Promise<HttpResponse>;
};
