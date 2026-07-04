import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/core.css';
import './styles/screens.css';
import './styles/followups.css';
import './styles/dashboard.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
