import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Bench } from './Bench';
import './bench.css';

const container = document.getElementById('bench');

if (!container) throw new Error('index.html has no #bench container');

createRoot(container).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
