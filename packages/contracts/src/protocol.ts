/** Bumped when a message changes in a way an older loader cannot read. Every message
 * carries it, and a receiver refuses any other version. */
export const PROTOCOL_VERSION = 1;

/** Marks our messages on a channel other scripts also write to. */
export const MESSAGE_SOURCE = 'checkout-embed';
