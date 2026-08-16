/**
 * Async on purpose. localStorage is synchronous, but a merchant on a strict privacy
 * setup may back this with something that is not, and widening the contract later is a
 * breaking change.
 */
export type StorageAdapter = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};
