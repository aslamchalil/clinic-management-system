import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App';
import './styles/theme.css';
import './styles/components.css';
import './styles/responsive.css';
import './styles/app.css';
import './styles/admin-phase-b.css';
import './styles/doctor.css';
import './styles/pharmacy.css';

const savedTheme=localStorage.getItem('cms_theme_v1')||'light';
document.documentElement.setAttribute('data-bs-theme',savedTheme);
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
