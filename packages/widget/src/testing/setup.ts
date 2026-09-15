import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only registers its own cleanup when vitest runs with globals on, and
// this repo does not. Without it every render piles up in the same document.
afterEach(cleanup);

// jsdom knows the dialog element and its open attribute but not showModal or close. This
// is enough for the component to open and close; the top layer and the focus trap are
// what the Playwright suite looks at.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}
