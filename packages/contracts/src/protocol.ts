/**
 * Bumped only when a message shape changes in a way an older loader cannot read.
 * A merchant may be serving a loader cached six months ago, so every message carries
 * this and a receiver refuses anything it does not recognise.
 */
export const PROTOCOL_VERSION = 1;

/** Marks our messages on a channel other scripts also write to. */
export const MESSAGE_SOURCE = 'checkout-embed';
