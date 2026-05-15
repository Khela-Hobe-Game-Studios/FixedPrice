import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KuiProvider } from '@khelahobe/kui';
import '@khelahobe/kui/styles';
import App from './App';
import { renderPreview } from './preview';
import './index.css';

const params = new URLSearchParams(window.location.search);
const previewName = params.get('preview');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <KuiProvider theme="fixedprice" colorMode="light">
      {previewName ? renderPreview(previewName) : <App />}
    </KuiProvider>
  </StrictMode>
);
