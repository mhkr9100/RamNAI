import React from 'react';
import ReactDOM from 'react-dom/client';
import { ToastProvider } from './components/ui';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
