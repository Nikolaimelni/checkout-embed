import { boot } from './boot.js';

// All the work is in boot.ts, where it can be tested without a page.
void boot({ view: window, document });
