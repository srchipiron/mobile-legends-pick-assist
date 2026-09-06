import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

/**
 * Sin esto, cualquier error de arranque deja la pantalla en negro y no hay forma
 * de saber qué pasó desde el móvil, que no tiene herramientas de desarrollo.
 * Con esto, al menos se ve el error y se puede reiniciar sin desinstalar nada.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    // Sin i18n a mano: si el fallo está en el propio arranque, lo único fiable
    // es el idioma del móvil.
    const es = (navigator.language ?? 'es').toLowerCase().startsWith('es');
    return (
      <div className="crash">
        <h1>{es ? 'La app ha fallado al arrancar' : 'The app failed to start'}</h1>
        <p>{String(this.state.error?.message ?? this.state.error)}</p>
        <pre>{this.state.error?.stack?.split('\n').slice(0, 4).join('\n')}</pre>
        <button
          onClick={() => {
            // Un draft guardado con datos raros puede ser la causa: se descarta.
            try { localStorage.removeItem('roam-picker:draft'); } catch { /* nada */ }
            location.reload();
          }}
        >
          {es ? 'Empezar de cero' : 'Start over'}
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
