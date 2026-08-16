import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only registers its own cleanup when vitest runs with globals on, and
// this repo does not. Without it every render piles up in the same document.
afterEach(cleanup);
