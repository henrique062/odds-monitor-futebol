<p align="center">
  <img src="https://img.shields.io/badge/⚽-Odds_Monitor-4f8ef7?style=for-the-badge" alt="Odds Monitor" />
</p>

<h1 align="center">Odds Monitor — Futebol 1×2 em Tempo Real</h1>

<p align="center">
  Monitor de odds do mercado <strong>1×2 (Money Line)</strong> para 20 ligas de futebol via WebSocket.<br/>
  Snapshot inicial via REST + atualizações em tempo real. Disponível em <strong>4 linguagens</strong>.
</p>

<p align="center">
  <a href="#-python"><img src="https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white" /></a>
  <a href="#-php"><img src="https://img.shields.io/badge/PHP-777BB4?style=flat-square&logo=php&logoColor=white" /></a>
  <a href="#-nodejs"><img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white" /></a>
  <a href="#-react"><img src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black" /></a>
  <a href="https://docs.odds-api.io/guides/websockets"><img src="https://img.shields.io/badge/WebSocket-API-green?style=flat-square" /></a>
  <img src="https://img.shields.io/badge/Ligas-20-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/Mercado-ML_1x2-blue?style=flat-square" />
</p>

---

## 📋 Índice

- [Funcionalidades](#-funcionalidades)
- [Ligas Monitoradas](#-ligas-monitoradas)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Python](#-python)
- [PHP](#-php)
- [Node.js](#-nodejs)
- [React](#-react)
- [Como a API funciona](#-como-a-api-funciona)
- [Configuração Avançada](#️-configuração-avançada)
- [Licença](#-licença)

---

## ✨ Funcionalidades

| Recurso                 | Descrição                                       |
| ----------------------- | ----------------------------------------------- |
| 📥 Snapshot inicial     | Carrega todos os jogos ao conectar via REST API |
| 📡 WebSocket ao vivo    | Recebe odds atualizadas em tempo real           |
| 🔄 Reconexão automática | Backoff exponencial até 10 tentativas           |
| 🏆 20 ligas simultâneas | Limite máximo suportado pela API                |
| 🎯 Mercado ML (1×2)     | Casa, Empate e Fora                             |
| 🔴 Live vs Pré-jogo     | Diferenciação visual de status                  |
| 🔍 Filtros dinâmicos    | Por time, liga ou bookmaker (React/HTML)        |
| 📝 Log de eventos       | Registro de conexão, updates e erros            |

---

## 🏆 Ligas Monitoradas

<details>
<summary>Ver todas as 20 ligas</summary>

| #   | Liga                 | Slug                         |
| --- | -------------------- | ---------------------------- |
| 1   | 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League    | `england-premier-league`     |
| 2   | 🇪🇸 La Liga           | `spain-la-liga`              |
| 3   | 🇩🇪 Bundesliga        | `germany-bundesliga`         |
| 4   | 🇮🇹 Serie A           | `italy-serie-a`              |
| 5   | 🇫🇷 Ligue 1           | `france-ligue-1`             |
| 6   | 🇳🇱 Eredivisie        | `netherlands-eredivisie`     |
| 7   | 🇵🇹 Primeira Liga     | `portugal-primeira-liga`     |
| 8   | 🇧🇷 Série A           | `brazil-serie-a`             |
| 9   | 🇧🇷 Série B           | `brazil-serie-b`             |
| 10  | 🇦🇷 Primera División  | `argentina-primera-division` |
| 11  | 🇺🇸 MLS               | `usa-mls`                    |
| 12  | 🇲🇽 Liga MX           | `mexico-liga-mx`             |
| 13  | 🏆 Champions League  | `champions-league`           |
| 14  | 🏆 Europa League     | `europa-league`              |
| 15  | 🏆 Conference League | `conference-league`          |
| 16  | 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Championship      | `england-championship`       |
| 17  | 🏴󠁧󠁢󠁳󠁣󠁴󠁿 Premiership       | `scotland-premiership`       |
| 18  | 🇹🇷 Süper Lig         | `turkey-super-lig`           |
| 19  | 🇬🇷 Super League      | `greece-super-league`        |
| 20  | 🇧🇪 First Division A  | `belgium-first-division-a`   |

</details>

---

## 📁 Estrutura do Projeto

```
odds-monitor-futebol/
│
├── 🐍 python/
│   ├── odds_terminal.py     # Script terminal colorido
│   └── requirements.txt     # websocket-client, requests, colorama
│
├── 🐘 php/
│   ├── odds_monitor.php     # Script terminal PHP
│   └── composer.json        # textalk/websocket, guzzlehttp/guzzle
│
├── 🟩 nodejs/
│   ├── odds_monitor.js      # Script terminal Node.js
│   └── package.json         # ws
│
├── ⚛️  react/
│   ├── src/
│   │   ├── App.jsx                # Componente principal
│   │   ├── App.css
│   │   ├── useOddsWebSocket.js    # Hook WebSocket + REST
│   │   ├── MatchTable.jsx         # Tabela de jogos agrupada por liga
│   │   ├── MatchTable.module.css
│   │   ├── OddBadge.jsx           # Badge colorido por faixa de odd
│   │   └── OddBadge.module.css
│   └── package.json
│
├── 🌐 odds_monitor.html     # Interface web standalone (sem build)
└── README.md
```

---

## 🐍 Python

Script de terminal com display colorido e atualização automática a cada 2 segundos.

### Instalação

```bash
cd python
pip install -r requirements.txt
```

### Uso

```bash
# Com argumento
python odds_terminal.py --key SUA_API_KEY

# Com variável de ambiente
set ODDS_API_KEY=SUA_API_KEY     # Windows CMD
$env:ODDS_API_KEY="SUA_API_KEY"  # PowerShell
export ODDS_API_KEY="SUA_API_KEY" # Linux/Mac
python odds_terminal.py
```

### Prévia

```
================================================================================
  ODDS MONITOR 1x2 (ML) - Futebol
  03/03/2026 11:00:00  |  Updates recebidos: 47
================================================================================

  [ENGLAND-PREMIER-LEAGUE]
  ID           JOGO                             BOOKIE       CASA     X   FORA  STATUS
  ---------------------------------------------------------------------------
  63017989     Arsenal x Chelsea                Pinnacle     1.85  3.25   2.10  AO VIVO
  63018001     Liverpool x Man City             Bet365       2.10  3.40   1.75  PRÉ-JOGO
```

---

## 🐘 PHP

### Instalação

```bash
cd php
composer install
```

### Uso

```bash
php odds_monitor.php --key SUA_API_KEY

# Ou via variável de ambiente
ODDS_API_KEY=SUA_KEY php odds_monitor.php
```

> **Requisito:** PHP 8.0+

---

## 🟩 Node.js

### Instalação

```bash
cd nodejs
npm install
```

### Uso

```bash
node odds_monitor.js --key SUA_API_KEY

# Ou
ODDS_API_KEY=SUA_KEY npm start
```

> **Requisito:** Node.js 16+

---

## ⚛️ React

App completo com interface visual dark mode, filtros interativos e log de eventos.

### Instalação e execução (desenvolvimento)

```bash
cd react
npm install
npm run dev
```

Acesse em `http://localhost:5173`

### Build para produção

```bash
npm run build
# Arquivos gerados em react/dist/
```

### Interface web standalone (sem build)

Também existe uma versão HTML pura na raiz do projeto:

```bash
# Inicie um servidor local
python -m http.server 8765
# Acesse: http://localhost:8765/odds_monitor.html
```

---

## 🔌 Como a API funciona

O projeto usa dois endpoints da [Odds-API.io](https://docs.odds-api.io):

```
┌──────────────────────────────────────────────────────────┐
│  1. REST (snapshot inicial)                               │
│     GET https://api.odds-api.io/v3/odds                  │
│     ?apiKey=KEY&sport=football&leagues=...&markets=ML     │
│                                                           │
│  2. WebSocket (atualizações em tempo real)               │
│     wss://api.odds-api.io/v3/ws                          │
│     ?apiKey=KEY&sport=football&leagues=...&markets=ML     │
└──────────────────────────────────────────────────────────┘
```

**Tipos de mensagem WebSocket:**

| Tipo         | Descrição                                |
| ------------ | ---------------------------------------- |
| `welcome`    | Confirmação de conexão + filtros ativos  |
| `created`    | Novo jogo/odd disponível                 |
| `updated`    | Odds de um jogo atualizada               |
| `deleted`    | Jogo removido                            |
| `no_markets` | Sem mercados disponíveis temporariamente |

**Formato da mensagem `updated`:**

```json
{
  "type": "updated",
  "id": "63017989",
  "bookie": "Pinnacle",
  "markets": [
    {
      "name": "ML",
      "odds": [{ "home": "1.85", "draw": "3.25", "away": "2.10" }]
    }
  ]
}
```

---

## ⚙️ Configuração Avançada

### Alterar ligas monitoradas (máx. 20)

Em qualquer implementação, edite a lista de ligas:

```python
# Python
FOOTBALL_LEAGUES = [
    "brazil-serie-a",
    "champions-league",
    # até 20 ligas
]
```

### Filtrar apenas jogos ao vivo

Adicione `status=live` na URL WebSocket:

```
wss://api.odds-api.io/v3/ws?apiKey=KEY&sport=football&markets=ML&status=live
```

### Adicionar outros mercados

Adicione `Spread` ou `Totals` ao parâmetro `markets`:

```
markets=ML,Spread,Totals
```

---

## 📦 Dependências por linguagem

| Linguagem | Pacote              | Versão   |
| --------- | ------------------- | -------- |
| Python    | `websocket-client`  | ≥ 1.6.0  |
| Python    | `requests`          | ≥ 2.31.0 |
| Python    | `colorama`          | ≥ 0.4.6  |
| PHP       | `textalk/websocket` | ^1.7     |
| PHP       | `guzzlehttp/guzzle` | ^7.0     |
| Node.js   | `ws`                | ^8.18.0  |
| React     | `vite` + `react`    | latest   |

---

## 📄 Licença

MIT © [henrique062](https://github.com/henrique062)

---

<p align="center">
  Desenvolvido com ❤️ • Powered by <a href="https://odds-api.io">odds-api.io</a>
</p>
