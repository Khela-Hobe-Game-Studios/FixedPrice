import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { renderPreview } from './preview';
import './board/board.css';
import './views/host/host.css';
import './views/player/player.css';

const params = new URLSearchParams(window.location.search);
const previewName = params.get('preview');

createRoot(document.getElementById('root')).render(
  <StrictMode>{previewName ? renderPreview(previewName) : <App />}</StrictMode>
);
