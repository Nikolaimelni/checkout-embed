import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Bench } from './Bench';
import './bench.css';

const container = document.getElementById('bench');

if (!container) throw new Error('index.html has no #bench container');

// StrictMode on purpose. It runs every effect twice in development, which is exactly the
// condition an idempotent mount has to survive, and the bench is where that shows up first.
createRoot(container).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
