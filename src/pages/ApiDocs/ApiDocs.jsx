import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ZapIcon,
  ActivityIcon,
  SearchIcon,
  PlayIcon,
  RefreshCwIcon,
  ClipboardIcon,
  CheckIcon,
  ShieldCheckIcon,
  LayoutListIcon,
  ChartBarIcon,
  UsersIcon,
  FileTextIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LayersIcon,
} from '../../icons/animate';
import { GlobeIcon } from '../../icons';
import './ApiDocs.css';

const ENDPOINT_GROUPS = [
  {
    group: 'Canonical Score APIs (Live & Match Collections)',
    sources: '10Cric (10cric2026.com), Cricbuzz, CREX, FanCode, ESPN, Football-Data.org',
    endpoints: [
      { method: 'GET', path: '/api/v1/matches/live', description: 'Live scores across 10Cric, CREX, Cricbuzz & merged providers' },
      { method: 'GET', path: '/api/v1/matches/upcoming', description: 'Upcoming & scheduled matches' },
      { method: 'GET', path: '/api/v1/matches/completed', description: 'Completed match results & scores' },
      { method: 'GET', path: '/api/v1/matches?sport=cricket&status=live', description: 'Filter matches by sport and live status' },
      { method: 'SSE', path: '/api/v1/live/stream', description: 'Real-time Server-Sent Events (SSE) live score stream' },
    ],
  },
  {
    group: 'Sport-Specific Live Score APIs',
    sources: '10Cric (https://www.10cric2026.com), CREX (crex.com), Cricbuzz, FanCode, ESPN',
    endpoints: [
      { method: 'GET', path: '/api/v1/cricket/live', description: 'Live Cricket Scores & Odds (10Cric 2026, CREX, Cricbuzz, FanCode)' },
      { method: 'GET', path: '/api/v1/football/live', description: 'Live Football/Soccer Scores (Football-Data.org, OpenLigaDB)' },
      { method: 'GET', path: '/api/v1/basketball/live', description: 'Live NBA & Basketball Scores (balldontlie, NBA Stats)' },
      { method: 'GET', path: '/api/v1/tennis/live', description: 'Live Tennis Matches (ATP/WTA public data)' },
      { method: 'GET', path: '/api/v1/formula1/live', description: 'Live F1 Race Telemetry & Times (OpenF1, Jolpica)' },
      { method: 'GET', path: '/api/v1/hockey/live', description: 'Live NHL Hockey Games' },
      { method: 'GET', path: '/api/v1/american-football/live', description: 'Live NFL/CFB Scores (CollegeFootballData)' },
      { method: 'GET', path: '/api/v1/multi-sport/live', description: 'Multi-Sport Live Matrix (TheSportsDB)' },
    ],
  },
  {
    group: 'Canonical Match Details & Attributes',
    sources: '10Cric Odds, CREX Ball-by-ball, Cricbuzz Commentary, Lineups & Officials',
    endpoints: [
      { method: 'GET', path: '/api/v1/cricket/matches/10cric_2026_101', description: 'Single match canonical details, scores & odds' },
      { method: 'GET', path: '/api/v1/commentary', description: 'Live ball-by-ball & minute-by-minute text commentary' },
      { method: 'GET', path: '/api/v1/events', description: 'Live match events (goals, boundaries, wickets, cards, VAR)' },
      { method: 'GET', path: '/api/v1/lineups', description: 'Team lineups, playing XI, substitutes & formations' },
      { method: 'GET', path: '/api/v1/officials', description: 'Match umpires, referees, VAR & scorers' },
      { method: 'GET', path: '/api/v1/statistics', description: 'Player & match performance statistics' },
    ],
  },
  {
    group: 'Entities, Standings & Search',
    sources: 'Global Sports Catalog, Standings, Rankings & Multi-Search',
    endpoints: [
      { method: 'GET', path: '/api/v1/sports', description: 'List of all sports catalog' },
      { method: 'GET', path: '/api/v1/countries', description: 'Country ISO codes, flags & info' },
      { method: 'GET', path: '/api/v1/leagues', description: 'Leagues & tournaments catalog' },
      { method: 'GET', path: '/api/v1/seasons', description: 'Season dates & winners' },
      { method: 'GET', path: '/api/v1/venues', description: 'Stadium venues & coordinates' },
      { method: 'GET', path: '/api/v1/teams', description: 'Standardized teams catalog' },
      { method: 'GET', path: '/api/v1/players', description: 'Players catalog & stats' },
      { method: 'GET', path: '/api/v1/standings', description: 'League standings & net run rate' },
      { method: 'GET', path: '/api/v1/rankings', description: 'Team & player global rankings' },
      { method: 'GET', path: '/api/v1/search?q=india', description: 'Global multi-entity search API' },
    ],
  },
];

export default function ApiDocs() {
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINT_GROUPS[0].endpoints[0]);
  const [urlInput, setUrlInput] = useState(ENDPOINT_GROUPS[0].endpoints[0].path);
  const [activeTab, setActiveTab] = useState('response');
  const [sdkLanguage, setSdkLanguage] = useState('curl');
  const [responseJson, setResponseJson] = useState(null);
  const [responseStatus, setResponseStatus] = useState(null);
  const [responseLatency, setResponseLatency] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setUrlInput(selectedEndpoint.path);
    executeRequest(selectedEndpoint.path);
  }, [selectedEndpoint]);

  const executeRequest = async (path) => {
    setIsLoading(true);
    const start = performance.now();
    try {
      const res = await fetch(path);
      const latency = Math.round(performance.now() - start);
      setResponseLatency(`${latency} ms`);
      setResponseStatus(`${res.status} ${res.statusText || 'OK'}`);
      if (res.ok) {
        const json = await res.json();
        setResponseJson(json);
      } else {
        setResponseJson({ error: 'Endpoint returned error status', status: res.status });
      }
    } catch (err) {
      setResponseLatency(`${Math.round(performance.now() - start)} ms`);
      setResponseStatus('Fetch Error');
      setResponseJson({ error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText('bk_live_998877665544332211');
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyCode = () => {
    const snippet = renderCodeSnippet();
    navigator.clipboard.writeText(snippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return ENDPOINT_GROUPS;
    const q = searchQuery.toLowerCase();
    return ENDPOINT_GROUPS.map((grp) => ({
      ...grp,
      endpoints: grp.endpoints.filter(
        (ep) => ep.path.toLowerCase().includes(q) || ep.description.toLowerCase().includes(q)
      ),
    })).filter((grp) => grp.endpoints.length > 0);
  }, [searchQuery]);

  const renderCodeSnippet = () => {
    const fullUrl = `http://localhost:5173${urlInput}`;
    switch (sdkLanguage) {
      case 'javascript':
        return `// Fetch Live Scores via BetKing API
const response = await fetch('${fullUrl}', {
  headers: { 'X-API-Key': 'bk_live_998877665544332211' }
});
const data = await response.json();
console.log('Live Scores:', data.data);`;
      case 'python':
        return `# Python BetKing API Client
import requests

url = "${fullUrl}"
headers = {"X-API-Key": "bk_live_998877665544332211"}
response = requests.get(url, headers=headers)
data = response.json()
print("Live Matches:", data.get("data"))`;
      case 'java':
        return `// Java HttpClient Request
HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${fullUrl}"))
    .header("X-API-Key", "bk_live_998877665544332211")
    .GET()
    .build();

HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`;
      case 'go':
        return `package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", "${fullUrl}", nil)
    req.Header.Add("X-API-Key", "bk_live_998877665544332211")
    resp, _ := client.Do(req)
    body, _ := ioutil.ReadAll(resp.Body)
    fmt.Println(string(body))
}`;
      case 'csharp':
        return `using System.Net.Http;
using System.Threading.Tasks;

var client = new HttpClient();
client.DefaultRequestHeaders.Add("X-API-Key", "bk_live_998877665544332211");
var response = await client.GetStringAsync("${fullUrl}");
Console.WriteLine(response);`;
      case 'curl':
      default:
        return `curl -X GET "${fullUrl}" \\
  -H "X-API-Key: bk_live_998877665544332211" \\
  -H "Accept: application/json"`;
    }
  };

  return (
    <div className="api-docs-container">
      {/* Hero Banner */}
      <motion.div
        className="api-hero"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="api-hero-badge">
          <ZapIcon size={14} /> Official Sports & Scores API Gateway v1.0
        </div>
        <h1 className="api-hero-title">
          World-Class Sports API & Live Score Aggregator
        </h1>
        <p className="api-hero-subtitle">
          Canonical REST & Server-Sent Events (SSE) API layer unifying <strong>10Cric 2026</strong>, <strong>CREX</strong>, <strong>Cricbuzz</strong>, <strong>FanCode</strong>, <strong>ESPN</strong>, and 9 global sports providers into a single high-availability endpoint suite.
        </p>

        {/* Featured Provider Tag Bar */}
        <div className="api-providers-tag-bar">
          <span className="api-provider-chip active">
            🔥 10Cric 2026 (<a href="https://www.10cric2026.com" target="_blank" rel="noreferrer">10cric2026.com</a>)
          </span>
          <span className="api-provider-chip">⚡ CREX Live (crex.com)</span>
          <span className="api-provider-chip">🏏 Cricbuzz API</span>
          <span className="api-provider-chip">📺 FanCode Stream</span>
          <span className="api-provider-chip">🌐 ESPN Sports</span>
        </div>

        {/* Metrics Grid */}
        <div className="api-metrics-grid">
          <motion.div className="api-metric-card" whileHover={{ scale: 1.02 }}>
            <div className="api-metric-icon status"><ActivityIcon size={18} /></div>
            <div>
              <span className="api-metric-label">Gateway Status</span>
              <span className="api-metric-val green">Operational (10Cric SSE Live)</span>
            </div>
          </motion.div>

          <motion.div className="api-metric-card" whileHover={{ scale: 1.02 }}>
            <div className="api-metric-icon latency"><ZapIcon size={18} /></div>
            <div>
              <span className="api-metric-label">Avg Response Time</span>
              <span className="api-metric-val">{responseLatency || '18 ms'}</span>
            </div>
          </motion.div>

          <motion.div className="api-metric-card" whileHover={{ scale: 1.02 }}>
            <div className="api-metric-icon sources"><GlobeIcon size={18} /></div>
            <div>
              <span className="api-metric-label">Data Providers Merged</span>
              <span className="api-metric-val">10 Live Sources</span>
            </div>
          </motion.div>

          <motion.div className="api-metric-card" whileHover={{ scale: 1.02 }}>
            <div className="api-metric-icon entities"><LayersIcon size={18} /></div>
            <div>
              <span className="api-metric-label">Canonical Entities</span>
              <span className="api-metric-val">22 Schemas</span>
            </div>
          </motion.div>
        </div>

        {/* API Key & Spec Bar */}
        <div className="api-auth-bar">
          <div className="api-key-box">
            <ShieldCheckIcon size={16} />
            <span>X-API-Key:</span>
            <code>bk_live_998877665544332211</code>
            <button
              type="button"
              className="api-copy-btn"
              onClick={handleCopyKey}
              title="Copy API Key"
            >
              {copiedKey ? <CheckIcon size={14} className="green" /> : <ClipboardIcon size={14} />}
            </button>
          </div>
          <div className="api-rate-limit">
            Rate Limit: <strong>10,000 req/day</strong> (1,420 used)
          </div>
          <a
            href="/api/v1/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="api-openapi-link"
          >
            📄 OpenAPI Spec (JSON) <ExternalLinkIcon size={14} />
          </a>
        </div>
      </motion.div>

      {/* Main Layout */}
      <div className="api-docs-layout">
        {/* Sidebar Endpoint Navigator */}
        <motion.div
          className="api-sidebar"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="api-sidebar-header">
            <span className="api-sidebar-title">Score & Data Endpoints</span>
            <div className="api-search-input-wrap">
              <SearchIcon size={14} className="api-search-icon" />
              <input
                type="text"
                className="api-search-input"
                placeholder="Filter endpoints..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="api-groups-list">
            {filteredGroups.map((grp) => (
              <div key={grp.group} className="api-group-box">
                <div className="api-group-title">{grp.group}</div>
                <div className="api-group-sources">{grp.sources}</div>
                <div className="api-endpoint-list">
                  {grp.endpoints.map((ep) => (
                    <motion.button
                      key={ep.path}
                      type="button"
                      className={`api-endpoint-item ${selectedEndpoint.path === ep.path ? 'active' : ''}`}
                      onClick={() => setSelectedEndpoint(ep)}
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className={`method-badge ${ep.method.toLowerCase()}`}>{ep.method}</span>
                      <span className="api-endpoint-path-text">{ep.path.replace('/api/v1', '')}</span>
                      <ChevronRightIcon size={14} className="api-item-arrow" />
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Main Console & Interactive Tester */}
        <motion.div
          className="api-main-console"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="api-console-card">
            <div className="api-console-header">
              <div>
                <span className="api-console-tag">REST API Playground</span>
                <h3 className="api-console-title">{selectedEndpoint.description}</h3>
              </div>
            </div>

            {/* URL Input & Request Button */}
            <div className="api-url-bar">
              <span className={`method-badge ${selectedEndpoint.method.toLowerCase()}`}>
                {selectedEndpoint.method}
              </span>
              <input
                type="text"
                className="api-url-input"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <button
                type="button"
                className="api-send-btn"
                onClick={() => executeRequest(urlInput)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <RefreshCwIcon size={16} className="spin" /> Sending...
                  </>
                ) : (
                  <>
                    <PlayIcon size={16} /> Run Request
                  </>
                )}
              </button>
            </div>

            {/* Tab Bar */}
            <div className="api-tab-bar">
              <button
                type="button"
                className={`api-tab ${activeTab === 'response' ? 'active' : ''}`}
                onClick={() => setActiveTab('response')}
              >
                <LayoutListIcon size={14} /> Canonical JSON Response
              </button>
              <button
                type="button"
                className={`api-tab ${activeTab === 'code' ? 'active' : ''}`}
                onClick={() => setActiveTab('code')}
              >
                <FileTextIcon size={14} /> SDK Code Snippets
              </button>
            </div>

            {/* Response Tab */}
            <AnimatePresence mode="wait">
              {activeTab === 'response' && (
                <motion.div
                  key="response"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="api-response-meta">
                    <span>Status: <strong className="status-tag success">{responseStatus || '200 OK'}</strong></span>
                    <span>Latency: <strong>{responseLatency || '18 ms'}</strong></span>
                    <span>Provider: <strong>{responseJson?.provider || 'gateway'}</strong></span>
                    <span>Content-Type: <strong>application/json</strong></span>
                  </div>

                  <pre className="api-code-block">
                    {JSON.stringify(responseJson, null, 2)}
                  </pre>
                </motion.div>
              )}

              {/* Code Snippet Tab */}
              {activeTab === 'code' && (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="api-response-meta" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div className="api-lang-chips">
                      {['curl', 'javascript', 'python', 'java', 'go', 'csharp'].map((lang) => (
                        <button
                          key={lang}
                          type="button"
                          className={`api-lang-chip ${sdkLanguage === lang ? 'active' : ''}`}
                          onClick={() => setSdkLanguage(lang)}
                        >
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="api-copy-code-btn"
                      onClick={handleCopyCode}
                    >
                      {copiedCode ? <CheckIcon size={14} className="green" /> : <ClipboardIcon size={14} />}
                      {copiedCode ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>

                  <pre className="api-code-block">
                    {renderCodeSnippet()}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
