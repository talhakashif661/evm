import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ToastContainer } from 'react-toastify';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { store } from './store/index.js';
import { initErrorTracking } from './utils/logger.js';
import { initAnalytics } from './utils/analytics.js';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';

// Both are no-ops unless their respective env vars are configured, and even
// then only in a production build — see logger.js / analytics.js.
initErrorTracking();
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <Provider store={store}>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <ToastContainer
            position="top-right"
            autoClose={3000}
            theme="light"
            toastStyle={{
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          />
        </BrowserRouter>
      </Provider>
    </HelmetProvider>
  </React.StrictMode>
);
