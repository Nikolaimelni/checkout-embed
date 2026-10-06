export type LogLevel = 'debug' | 'warn' | 'error';

export type Logger = {
  log(level: LogLevel, message: string, detail?: Readonly<Record<string, unknown>>): void;
};

export const silentLogger: Logger = {
  log() {},
};
