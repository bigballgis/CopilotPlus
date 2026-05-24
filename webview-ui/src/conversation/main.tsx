import { createRoot } from 'react-dom/client';
import { ensureToolkitDesignSystem } from '../shared/toolkit';
import { App } from './App';
import '../shared/theme.css';
import './conversation.css';

ensureToolkitDesignSystem();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Conversation webview root element not found');
}

createRoot(root).render(<App />);
