import { boot } from './boot.js';

// The whole file a merchant's tag points at. Everything it does lives in boot.ts, where
// it can be tested without a page around it.
void boot({ view: window, document });
