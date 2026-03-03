import { useState, useEffect } from 'react';
import { useOddsWebSocket } from './useOddsWebSocket';
import { MatchTable } from './MatchTable';
import './App.css';

export default function App() {
  const [apiKey,       setApiKey]       = useState('');
  const [inputKey,     setInputKey]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewFilter,   setViewFilter]   = useState('all');
  const [search,       setSearch]       = useState('');
  const [showLog,      setShowLog]      = useState(false);
  const [clock,        setClock]        = useState('');

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString('pt-BR')), 1000);
    return () => clearInterval(t);
  }, []);

  const { matches, wsStatus, updateCount, logs, disconnect } = useOddsWebSocket(apiKey, statusFilter);

  const matchCount = Object.keys(matches).length;
  const isConnected = wsStatus === 'connected';

  function handleStart(e) {
    e.preventDefault();
    if (inputKey.trim()) setApiKey(inputKey.trim());
  }

  function handleDisconnect() {
    disconnect();
    setApiKey('');
  }

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="logo">
          <span>⚽</span>
          <span>Odds Monitor</span>
          <span className="logo-sub">1×2 Futebol</span>
        </div>
        <div className="badges">
          <div className="badge accent">🔄 {updateCount} updates</div>
          <div className="badge accent">📋 {matchCount} jogos</div>
          <div className={`badge ${isConnected ? 'green' : 'red'}`}>
            <span className={`dot ${isConnected ? 'pulse' : ''}`} />
            {isConnected ? 'Conectado' : 'Desconectado'}
          </div>
          <div className="badge accent">🕐 {clock}</div>
        </div>
      </header>

      {/* ── SETUP ── */}
      {!apiKey && (
        <div className="setup-wrap">
          <div className="setup-card">
            <h2>🔑 Configurar API Key</h2>
            <p>Informe sua chave da <a href="https://odds-api.io" target="_blank" rel="noreferrer">odds-api.io</a> para receber odds em tempo real.</p>
            <form onSubmit={handleStart}>
              <label>API KEY</label>
              <input
                type="text" placeholder="Sua API Key aqui..."
                value={inputKey} onChange={e => setInputKey(e.target.value)}
                autoComplete="off" />
              <label style={{marginTop:16}}>STATUS DOS JOGOS</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">Todos (live + prematch)</option>
                <option value="live">Só ao vivo</option>
                <option value="prematch">Só pré-jogo</option>
              </select>
              <button type="submit">▶ Conectar e Monitorar</button>
            </form>
          </div>
        </div>
      )}

      {/* ── DASHBOARD ── */}
      {apiKey && (
        <>
          <div className="filters">
            <input
              type="text" placeholder="Buscar time, liga, bookie..."
              value={search} onChange={e => setSearch(e.target.value)} />
            {['all','live','prematch'].map(f => (
              <button key={f}
                className={`filter-btn ${viewFilter === f ? 'active' : ''}`}
                onClick={() => setViewFilter(f)}>
                {f === 'all' ? 'Todos' : f === 'live' ? '🔴 Ao vivo' : '⚪ Pré-jogo'}
              </button>
            ))}
            <button className="filter-btn danger" onClick={handleDisconnect}>✕ Desconectar</button>
          </div>

          <MatchTable matches={matches} viewFilter={viewFilter} search={search} />

          {/* ── LOG ── */}
          <div className="log-section">
            <button className="log-toggle" onClick={() => setShowLog(v => !v)}>
              {showLog ? '▼ Ocultar log' : '▶ Mostrar log de eventos'}
            </button>
            {showLog && (
              <div className="log-box">
                {logs.map(l => (
                  <div key={l.id} className="log-line">
                    <span className="log-ts">[{l.ts}]</span>{' '}
                    <span className={`log-msg log-${l.type}`}>{l.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
