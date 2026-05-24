import { createRoot } from 'react-dom/client';
import { ensureToolkitDesignSystem } from '../shared/toolkit';
import { App } from './App';
import '../shared/theme.css';
import './tabWorkspace.css';

ensureToolkitDesignSystem();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Tab Workspace webview root element not found');
}

createRoot(root).render(<App />);
