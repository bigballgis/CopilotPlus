import { createRoot } from 'react-dom/client';
import { App } from './App';
import './conversation.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Conversation webview root element not found');
}

createRoot(root).render(<App />);
