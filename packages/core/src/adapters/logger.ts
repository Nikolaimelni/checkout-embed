export type LogLevel = 'debug' | 'warn' | 'error';

/**
 * One method rather than one per level. The widget runs inside someone else's page and a
 * merchant may want every line routed to their own telemetry, which is easier to wire up
 * when there is a single entry point.
 */
export type Logger = {
  log(level: LogLevel, message: string, detail?: Readonly<Record<string, unknown>>): void;
};

export const silentLogger: Logger = {
  log() {
    // The default. A payment widget that writes to a merchant's console uninvited is rude.
  },
};
