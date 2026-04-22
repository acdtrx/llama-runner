import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { sseClient } from './sse/client';
import './index.css';

// Import for side effects: these modules subscribe to sseClient on import.
import './stores/server';
import './sse/status';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('root element missing');

sseClient.start();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
