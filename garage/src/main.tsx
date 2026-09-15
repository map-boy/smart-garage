import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {installCrashReporter} from './lib/crashReporter';

// Crashes go to the project's own `diagnostics` collection, where the
// technician console reads them alongside every other install. This replaced
// Sentry, whose free tier ran out and whose DSN was hard-coded here.
installCrashReporter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
