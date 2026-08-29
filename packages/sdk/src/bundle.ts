import { bootstrap } from './runtime/drain.js';

// The file the loader injects. Importing the package from npm gets index.ts instead, which
// has no side effects and no opinion about a global.
bootstrap();
