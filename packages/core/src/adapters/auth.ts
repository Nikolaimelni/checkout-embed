export type TokenRequest = {
  /** Set after a 401, so the host knows to mint a new token rather than replay a cached one. */
  readonly forceRefresh?: boolean;
};

/**
 * The merchant owns authentication. We ask for a token and never store one, which is why
 * this is a callback rather than a field on the config.
 */
export type AuthAdapter = {
  getToken(request?: TokenRequest): Promise<string>;
};
