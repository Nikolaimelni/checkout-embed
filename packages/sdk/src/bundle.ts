import { bootstrap } from './runtime/drain.js';

// What the loader injects. The npm entry is index.ts, which has no side effects.
bootstrap();
