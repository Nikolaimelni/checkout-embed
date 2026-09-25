export type LogLevel = 'debug' | 'warn' | 'error';

/** One method, so piping every line into a merchant's telemetry is one function. */
export type Logger = {
  log(level: LogLevel, message: string, detail?: Readonly<Record<string, unknown>>): void;
};

export const silentLogger: Logger = {
  log() {
    // Silent unless the merchant passes a logger.
  },
};
