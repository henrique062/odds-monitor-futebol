<?php
/**
 * Odds Monitor - Futebol 1x2 (ML) via WebSocket
 * ================================================
 * Instalação:
 *   composer install
 *
 * Uso:
 *   php odds_monitor.php --key SUA_API_KEY
 *   ou: ODDS_API_KEY=SUA_KEY php odds_monitor.php
 */

require_once __DIR__ . '/vendor/autoload.php';

use WebSocket\Client;
use WebSocket\ConnectionException;

// ── CONFIGURAÇÃO ──────────────────────────────────────────────
const LEAGUES = [
    'england-premier-league', 'spain-la-liga', 'germany-bundesliga',
    'italy-serie-a', 'france-ligue-1', 'netherlands-eredivisie',
    'portugal-primeira-liga', 'brazil-serie-a', 'brazil-serie-b',
    'argentina-primera-division', 'usa-mls', 'mexico-liga-mx',
    'champions-league', 'europa-league', 'conference-league',
    'england-championship', 'scotland-premiership', 'turkey-super-lig',
    'greece-super-league', 'belgium-first-division-a',
];

const REST_BASE = 'https://api.odds-api.io/v3';
const WS_BASE   = 'wss://api.odds-api.io/v3/ws';

// ── CORES ANSI ────────────────────────────────────────────────
function c(string $text, string $color): string {
    $codes = [
        'cyan'    => "\033[36m", 'magenta' => "\033[35m",
        'green'   => "\033[32m", 'yellow'  => "\033[33m",
        'red'     => "\033[31m", 'white'   => "\033[37m",
        'dim'     => "\033[2m",  'bold'    => "\033[1m",
        'reset'   => "\033[0m",
    ];
    return ($codes[$color] ?? '') . $text . "\033[0m";
}

function clearScreen(): void {
    echo PHP_OS_FAMILY === 'Windows' ? "\x1B[2J\x1B[0;0H" : "\033[2J\033[0;0H";
}

function fmtOdd(?string $v): string {
    if ($v === null || $v === '') return '  –  ';
    $f = (float)$v;
    $color = $f < 2.0 ? 'green' : ($f < 3.5 ? 'yellow' : 'red');
    return c(number_format($f, 2), $color);
}

// ── ESTADO GLOBAL ────────────────────────────────────────────
$matches     = [];
$updateCount = 0;

// ── DISPLAY ──────────────────────────────────────────────────
function printMatches(array $matches, int $updateCount): void {
    clearScreen();
    $now = date('d/m/Y H:i:s');
    $w = 80;
    echo c(str_repeat('=', $w), 'cyan') . PHP_EOL;
    echo c("  ODDS MONITOR 1x2 (ML) - Futebol [PHP]", 'cyan') . PHP_EOL;
    echo c("  $now  |  Updates: $updateCount", 'cyan') . PHP_EOL;
    echo c(str_repeat('=', $w), 'cyan') . PHP_EOL;

    if (empty($matches)) {
        echo c("\n  Aguardando dados da API...\n", 'yellow');
        return;
    }

    // Agrupa por liga
    $byLeague = [];
    foreach ($matches as $m) {
        $byLeague[$m['liga']][] = $m;
    }
    ksort($byLeague);

    $total = 0;
    foreach ($byLeague as $liga => $games) {
        echo PHP_EOL . c("  [" . strtoupper($liga) . "]", 'magenta') . PHP_EOL;
        echo c("  " . str_pad('ID', 12) . str_pad('JOGO', 34) . str_pad('BOOKIE', 13) . str_pad('CASA', 7) . str_pad('X', 7) . str_pad('FORA', 7) . "STATUS", 'dim') . PHP_EOL;
        echo c("  " . str_repeat('-', 76), 'dim') . PHP_EOL;

        usort($games, fn($a, $b) => strcmp($a['starts_at'] ?? '', $b['starts_at'] ?? ''));
        foreach ($games as $g) {
            $ml    = $g['ml'] ?? [];
            $id    = substr($g['id'], 0, 11);
            $home  = substr($g['home'] ?? '?', 0, 15);
            $away  = substr($g['away'] ?? '?', 0, 15);
            $jogo  = substr("$home x $away", 0, 32);
            $bk    = substr($g['bookie'] ?? '', 0, 12);
            $isLive = ($g['status'] ?? '') === 'live';
            $status = $isLive ? c('AO VIVO', 'red') : c('PRE-JOGO', 'dim');

            printf(
                "  %-12s %-32s %-13s %6s %6s %6s %s\n",
                $id, $jogo, $bk,
                fmtOdd($ml['home'] ?? null),
                fmtOdd($ml['draw'] ?? null),
                fmtOdd($ml['away'] ?? null),
                $status
            );
            $total++;
        }
    }

    echo PHP_EOL . c(str_repeat('=', $w), 'cyan') . PHP_EOL;
    echo "  Total de jogos: " . c((string)$total, 'yellow') . "  | Ctrl+C para sair" . PHP_EOL;
    echo c(str_repeat('=', $w), 'cyan') . PHP_EOL;
}

// ── REST SNAPSHOT ─────────────────────────────────────────────
function fetchSnapshot(string $apiKey, array &$matches): void {
    echo c("  Buscando snapshot inicial via REST...", 'yellow') . PHP_EOL;
    $params = http_build_query([
        'apiKey'  => $apiKey,
        'sport'   => 'football',
        'leagues' => implode(',', LEAGUES),
        'markets' => 'ML',
    ]);
    $url = REST_BASE . '/odds?' . $params;
    $json = @file_get_contents($url);
    if (!$json) {
        echo c("  Snapshot falhou. Aguardando WebSocket...", 'yellow') . PHP_EOL;
        return;
    }
    $data   = json_decode($json, true);
    $events = is_array($data) ? $data : ($data['data'] ?? $data['events'] ?? []);
    foreach ($events as $ev) {
        ingestRestEvent($ev, $matches);
    }
    echo c("  Snapshot OK: " . count($events) . " eventos", 'green') . PHP_EOL . PHP_EOL;
}

function parseTeams(array $ev): array {
    $home = $away = '';
    $parts = $ev['participants'] ?? $ev['teams'] ?? [];
    if (count($parts) >= 2) {
        $home = is_array($parts[0]) ? ($parts[0]['name'] ?? '') : $parts[0];
        $away = is_array($parts[1]) ? ($parts[1]['name'] ?? '') : $parts[1];
    }
    if (!$home) $home = $ev['home_team'] ?? $ev['home'] ?? '';
    if (!$away) $away = $ev['away_team'] ?? $ev['away'] ?? '';
    return [$home, $away];
}

function parseLeague(array $ev): string {
    $lg = $ev['league'] ?? '';
    if (is_array($lg)) return $lg['slug'] ?? $lg['name'] ?? 'outras';
    return $ev['league_slug'] ?? $lg ?: 'outras';
}

function parseML(array $markets): array {
    foreach ($markets as $m) {
        if (strtoupper($m['name'] ?? '') === 'ML') {
            $o = $m['odds'][0] ?? [];
            if (!empty($o['home']) || !empty($o['draw']) || !empty($o['away'])) {
                return ['home' => $o['home'] ?? null, 'draw' => $o['draw'] ?? null, 'away' => $o['away'] ?? null];
            }
        }
    }
    return [];
}

function ingestRestEvent(array $ev, array &$matches): void {
    $eid = (string)($ev['id'] ?? '');
    if (!$eid) return;
    [$home, $away] = parseTeams($ev);
    $ml = parseML($ev['markets'] ?? $ev['odds'] ?? []);
    $matches[$eid] = [
        'id'        => $eid,
        'home'      => $home,
        'away'      => $away,
        'starts_at' => $ev['starts_at'] ?? $ev['start_time'] ?? '',
        'status'    => $ev['status'] ?? 'prematch',
        'liga'      => parseLeague($ev),
        'bookie'    => $ev['bookmaker'] ?? $ev['bookie'] ?? '',
        'ml'        => $ml,
    ];
}

// ── WEBSOCKET ─────────────────────────────────────────────────
function buildWsUrl(string $apiKey): string {
    $p = http_build_query([
        'apiKey'  => $apiKey,
        'sport'   => 'football',
        'leagues' => implode(',', LEAGUES),
        'markets' => 'ML',
    ]);
    return WS_BASE . '?' . $p;
}

function connectWs(string $apiKey, array &$matches, int &$updateCount): void {
    $attempt = 0;
    while (true) {
        try {
            echo c("  Conectando ao WebSocket... (tentativa " . ($attempt + 1) . ")", 'cyan') . PHP_EOL;
            $client = new Client(buildWsUrl($apiKey), ['timeout' => 60]);

            echo c("  WebSocket conectado!", 'green') . PHP_EOL;
            $attempt = 0;

            while (true) {
                try {
                    $raw = $client->receive();
                    if ($raw === null) continue;

                    $data = json_decode($raw, true);
                    if (!$data) continue;

                    $type = $data['type'] ?? '';
                    $eid  = (string)($data['id'] ?? '');

                    if ($type === 'welcome') {
                        echo c("  {$data['message']}", 'green') . PHP_EOL;
                        if (!empty($data['warning'])) {
                            echo c("  AVISO: {$data['warning']}", 'yellow') . PHP_EOL;
                        }
                        continue;
                    }

                    if (!$eid) continue;

                    if ($type === 'deleted') {
                        unset($matches[$eid]);
                        printMatches($matches, $updateCount);
                        continue;
                    }

                    if ($type === 'created' || $type === 'updated') {
                        $ml = parseML($data['markets'] ?? []);
                        if (empty($ml)) continue;

                        $updateCount++;
                        if (!isset($matches[$eid])) {
                            [$home, $away] = parseTeams($data);
                            $matches[$eid] = [
                                'id'        => $eid,
                                'home'      => $home,
                                'away'      => $away,
                                'starts_at' => $data['starts_at'] ?? '',
                                'status'    => $data['status'] ?? 'prematch',
                                'liga'      => parseLeague($data),
                                'bookie'    => $data['bookie'] ?? '',
                                'ml'        => $ml,
                            ];
                        } else {
                            $matches[$eid]['ml']     = $ml;
                            $matches[$eid]['status'] = $data['status'] ?? $matches[$eid]['status'];
                            $matches[$eid]['bookie'] = $data['bookie'] ?? $matches[$eid]['bookie'];
                        }
                        printMatches($matches, $updateCount);
                    }
                } catch (ConnectionException $e) {
                    echo c("  Conexão perdida: " . $e->getMessage(), 'yellow') . PHP_EOL;
                    break;
                }
            }
        } catch (\Exception $e) {
            echo c("  Erro: " . $e->getMessage(), 'red') . PHP_EOL;
        }

        $attempt++;
        $delay = min(pow(2, $attempt), 60);
        echo c("  Reconectando em {$delay}s... (tentativa $attempt/10)", 'yellow') . PHP_EOL;
        if ($attempt >= 10) { echo c("  Máximo de tentativas.", 'red') . PHP_EOL; exit(1); }
        sleep($delay);
    }
}

// ── MAIN ─────────────────────────────────────────────────────
$opts   = getopt('k:', ['key:']);
$apiKey = $opts['key'] ?? $opts['k'] ?? getenv('ODDS_API_KEY') ?: null;

if (!$apiKey) {
    echo c("\n  API Key não informada!\n", 'red');
    echo "  Uso: php odds_monitor.php --key SUA_API_KEY\n";
    exit(1);
}

echo PHP_EOL . c(str_repeat('=', 60), 'cyan') . PHP_EOL;
echo c("  ODDS MONITOR [PHP] — Iniciando", 'cyan') . PHP_EOL;
echo c(str_repeat('=', 60), 'cyan') . PHP_EOL;
echo "  Key: " . substr($apiKey, 0, 6) . str_repeat('*', max(0, strlen($apiKey) - 6)) . PHP_EOL;
echo "  Ligas: " . count(LEAGUES) . " | Mercado: ML (1x2)" . PHP_EOL . PHP_EOL;

fetchSnapshot($apiKey, $matches);
printMatches($matches, $updateCount);
connectWs($apiKey, $matches, $updateCount);
