export type TokenRequest = {
  readonly forceRefresh?: boolean;
};

export type AuthAdapter = {
  getToken(request?: TokenRequest): Promise<string>;
};
