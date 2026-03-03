import { useMemo } from 'react';
import { OddBadge } from './OddBadge';
import styles from './MatchTable.module.css';

function fmtTime(s) {
  if (!s) return '–';
  try {
    return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

function MatchRow({ match }) {
  const isLive = match.status === 'live';
  return (
    <tr className={match._new ? styles.newRow : ''}>
      <td>
        <div className={styles.teamCell}>
          <span className={styles.teams}>{match.home || '?'} <span className={styles.vs}>×</span> {match.away || '?'}</span>
          <span className={styles.time}>⏰ {fmtTime(match.starts_at)}</span>
        </div>
      </td>
      <td className={styles.center}>
        {isLive
          ? <span className={styles.liveBadge}><span className={styles.dot} />AO VIVO</span>
          : <span className={styles.preBadge}>Pré-jogo</span>}
      </td>
      <td className={styles.center}><OddBadge value={match.ml?.home} /></td>
      <td className={styles.center}><OddBadge value={match.ml?.draw} /></td>
      <td className={styles.center}><OddBadge value={match.ml?.away} /></td>
      <td><span className={styles.bookie}>{match.bookie || '–'}</span></td>
      <td className={styles.id}>{match.id}</td>
    </tr>
  );
}

export function MatchTable({ matches, viewFilter, search }) {
  const grouped = useMemo(() => {
    let all = Object.values(matches);
    if (viewFilter === 'live')     all = all.filter(m => m.status === 'live');
    if (viewFilter === 'prematch') all = all.filter(m => m.status !== 'live');
    if (search) {
      const q = search.toLowerCase();
      all = all.filter(m => `${m.home} ${m.away} ${m.liga} ${m.bookie}`.toLowerCase().includes(q));
    }
    const map = {};
    all.forEach(m => { (map[m.liga] ??= []).push(m); });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [matches, viewFilter, search]);

  const total = useMemo(() => Object.values(matches).length, [matches]);
  const live  = useMemo(() => Object.values(matches).filter(m => m.status === 'live').length, [matches]);

  if (grouped.length === 0) {
    return (
      <div className={styles.empty}>
        <div>📡</div>
        <p>Aguardando dados da API...</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.statsRow}>
        <span>Jogos: <b>{total}</b></span>
        <span>Ao vivo: <b style={{color:'#ef4444'}}>{live}</b></span>
        <span>Pré-jogo: <b>{total - live}</b></span>
        <span>Ligas: <b>{grouped.length}</b></span>
      </div>
      {grouped.map(([liga, games]) => (
        <div key={liga} className={styles.leagueBlock}>
          <div className={styles.ligaTitle}>
            🏆 {liga}
            <span className={styles.ligaCount}>{games.length}</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Jogo</th>
                  <th className={styles.center}>Status</th>
                  <th className={styles.center}>Casa</th>
                  <th className={styles.center}>X</th>
                  <th className={styles.center}>Fora</th>
                  <th>Bookie</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {games
                  .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
                  .map(g => <MatchRow key={`${g.id}-${g.bookie}`} match={g} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
