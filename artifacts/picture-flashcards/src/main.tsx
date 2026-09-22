import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const preventBrowserZoom = (event: TouchEvent) => {
  if (event.touches.length > 1) event.preventDefault();
};

const preventSafariGestureZoom = (event: Event) => {
  event.preventDefault();
};

const preventCtrlWheelZoom = (event: WheelEvent) => {
  if (event.ctrlKey) event.preventDefault();
};

document.addEventListener('touchstart', preventBrowserZoom, {
  capture: true,
  passive: false,
});
document.addEventListener('touchmove', preventBrowserZoom, {
  capture: true,
  passive: false,
});
document.addEventListener('gesturestart', preventSafariGestureZoom, {
  capture: true,
  passive: false,
});
document.addEventListener('gesturechange', preventSafariGestureZoom, {
  capture: true,
  passive: false,
});
document.addEventListener('gestureend', preventSafariGestureZoom, {
  capture: true,
  passive: false,
});
document.addEventListener('wheel', preventCtrlWheelZoom, {
  capture: true,
  passive: false,
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}service-worker.js`,
    );
  });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
