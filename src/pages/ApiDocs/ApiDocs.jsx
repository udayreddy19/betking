import React, { useState, useEffect } from 'react';
import './ApiDocs.css';

const ENDPOINT_GROUPS = [
  {
    group: 'Cricket Gateway APIs',
    sources: 'CREX (crex.com), Cricbuzz (unofficial), CricAPI (free tier), OpenCricket, Cricsheet',
    endpoints: [
      { method: 'GET', path: '/api/v1/cricket/live', description: 'Live scores, scorecards, commentary & schedules' },
      { method: 'GET', path: '/api/v1/cricket/upcoming', description: 'Upcoming & scheduled cricket fixtures' },
      { method: 'GET', path: '/api/v1/cricket/matches/cb_1', description: 'Get match overview by ID' },
      { method: 'GET', path: '/api/v1/cricket/teams/team_hampshire', description: 'Get cricket team profile' },
      { method: 'GET', path: '/api/v1/cricket/players/ply_james_vince', description: 'Get cricket player profile & stats' },
    ],
  },
  {
    group: 'Football Gateway APIs',
    sources: 'Football-Data.org, OpenLigaDB, ESPN APIs',
    endpoints: [
      { method: 'GET', path: '/api/v1/football/live', description: 'Fixtures, standings, teams & player data' },
      { method: 'GET', path: '/api/v1/football/upcoming', description: 'Upcoming football fixtures' },
    ],
  },
  {
    group: 'Basketball Gateway APIs',
    sources: 'balldontlie, NBA Stats API',
    endpoints: [
      { method: 'GET', path: '/api/v1/basketball/live', description: 'Scores, players & standings' },
    ],
  },
  {
    group: 'Baseball Gateway APIs',
    sources: 'MLB Stats API',
    endpoints: [
      { method: 'GET', path: '/api/v1/baseball/live', description: 'Live games, players & teams' },
    ],
  },
  {
    group: 'Hockey Gateway APIs',
    sources: 'NHL API',
    endpoints: [
      { method: 'GET', path: '/api/v1/hockey/live', description: 'Scores, players & schedules' },
    ],
  },
  {
    group: 'Formula 1 Gateway APIs',
    sources: 'OpenF1, Jolpica (Ergast successor)',
    endpoints: [
      { method: 'GET', path: '/api/v1/formula1/live', description: 'Live telemetry, drivers & race results' },
    ],
  },
  {
    group: 'Tennis Gateway APIs',
    sources: 'Tennis Abstract datasets, ATP/WTA public data',
    endpoints: [
      { method: 'GET', path: '/api/v1/tennis/live', description: 'Rankings, schedules & players' },
    ],
  },
  {
    group: 'American Football Gateway APIs',
    sources: 'CollegeFootballData, CFL API',
    endpoints: [
      { method: 'GET', path: '/api/v1/american-football/live', description: 'Teams, schedules & scores' },
    ],
  },
  {
    group: 'Multi-Sport Gateway APIs',
    sources: 'TheSportsDB, ESPN (unofficial), SportScore (free tier)',
    endpoints: [
      { method: 'GET', path: '/api/v1/multi-sport/live', description: 'Live scores, fixtures, player stats & leagues' },
    ],
  },
  {
    group: 'Real-Time Event Stream',
    sources: 'Server-Sent Events (SSE)',
    endpoints: [
      { method: 'WS', path: '/api/v1/live/stream', description: 'Server-Sent Event (SSE) live score stream' },
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
      setResponseStatus(`${res.status} ${res.statusText}`);
      setResponseLatency(`${latency} ms`);
      const data = await res.json();
      setResponseJson(data);
    } catch (err) {
      setResponseStatus('500 Error');
      setResponseLatency('0 ms');
      setResponseJson({ error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const renderCodeSnippet = () => {
    const fullUrl = `http://localhost:5173${urlInput}`;
    if (sdkLanguage === 'curl') {
      return `curl -X GET "${fullUrl}" \\\n  -H "X-API-Key: bk_live_998877665544332211" \\\n  -H "Accept: application/json"`;
    }
    if (sdkLanguage === 'javascript') {
      return `fetch("${fullUrl}", {\n  headers: {\n    "X-API-Key": "bk_live_998877665544332211"\n  }\n})\n.then(res => res.json())\n.then(data => console.log(data));`;
    }
    if (sdkLanguage === 'python') {
      return `import requests\n\nurl = "${fullUrl}"\nheaders = {"X-API-Key": "bk_live_998877665544332211"}\n\nresponse = requests.get(url, headers=headers)\nprint(response.json())`;
    }
    if (sdkLanguage === 'java') {
      return `HttpRequest request = HttpRequest.newBuilder()\n  .uri(URI.create("${fullUrl}"))\n  .header("X-API-Key", "bk_live_998877665544332211")\n  .GET()\n  .build();\nHttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());`;
    }
    if (sdkLanguage === 'go') {
      return `req, _ := http.NewRequest("GET", "${fullUrl}", nil)\nreq.Header.Add("X-API-Key", "bk_live_998877665544332211")\nres, _ := http.DefaultClient.Do(req)\ndefer res.Body.Close()`;
    }
    return `var client = new HttpClient();\nclient.DefaultRequestHeaders.Add("X-API-Key", "bk_live_998877665544332211");\nvar response = await client.GetAsync("${fullUrl}");`;
  };

  return (
    <div className="api-docs-page">
      <div className="api-docs-header">
        <div className="api-docs-title">
          <span>🌐 Sports API Gateway & Aggregator</span>
          <span className="method-badge get">v1.0 Free Sources Matrix</span>
        </div>
        <p className="api-docs-subtitle">
          Stateless Sports API Gateway aggregating Cricbuzz, Football-Data.org, balldontlie, MLB Stats, NHL API, OpenF1, Tennis Abstract, CollegeFootballData & TheSportsDB.
        </p>

        <div className="api-auth-bar">
          <div className="api-key-box">
            <span>X-API-Key:</span>
            <code>bk_live_998877665544332211</code>
          </div>
          <div className="api-rate-limit">
            Rate Limit: <strong>10,000 req/day</strong> (1,420 used)
          </div>
          <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="api-tab active" style={{ marginLeft: 'auto' }}>
            📄 Download OpenAPI Spec (JSON)
          </a>
        </div>
      </div>

      <div className="api-docs-layout">
        <div className="api-sidebar">
          <div className="api-sidebar-title">Gateway Endpoints</div>

          {ENDPOINT_GROUPS.map((grp) => (
            <div key={grp.group}>
              <div className="api-group-title">{grp.group}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                {grp.sources}
              </div>
              <div className="api-endpoint-list">
                {grp.endpoints.map((ep) => (
                  <button
                    key={ep.path}
                    type="button"
                    className={`api-endpoint-item ${selectedEndpoint.path === ep.path ? 'active' : ''}`}
                    onClick={() => setSelectedEndpoint(ep)}
                  >
                    <span className={`method-badge ${ep.method.toLowerCase()}`}>{ep.method}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ep.path.replace('/api/v1', '')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="api-main-console">
          <div className="api-console-card">
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 800, marginBottom: '8px' }}>
              {selectedEndpoint.description}
            </h3>

            <div className="api-url-bar">
              <span className={`method-badge ${selectedEndpoint.method.toLowerCase()}`} style={{ padding: '10px 14px', fontSize: '0.8rem' }}>
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
                {isLoading ? 'Sending...' : 'Send Request'}
              </button>
            </div>

            <div className="api-tab-bar">
              <button
                type="button"
                className={`api-tab ${activeTab === 'response' ? 'active' : ''}`}
                onClick={() => setActiveTab('response')}
              >
                Normalized JSON Response
              </button>
              <button
                type="button"
                className={`api-tab ${activeTab === 'code' ? 'active' : ''}`}
                onClick={() => setActiveTab('code')}
              >
                Code Snippets (SDK)
              </button>
            </div>

            {activeTab === 'response' && (
              <div>
                <div className="api-response-meta">
                  <span>Status: <strong className="status-tag success">{responseStatus || '200 OK'}</strong></span>
                  <span>Latency: <strong>{responseLatency || '18 ms'}</strong></span>
                  <span>Active Provider: <strong>{responseJson?.provider || 'cricbuzz-unofficial'}</strong></span>
                  <span>Content-Type: <strong>application/json</strong></span>
                </div>

                <pre className="api-code-block">
                  {JSON.stringify(responseJson, null, 2)}
                </pre>
              </div>
            )}

            {activeTab === 'code' && (
              <div>
                <div className="api-response-meta" style={{ gap: '8px', marginBottom: '12px' }}>
                  {['curl', 'javascript', 'python', 'java', 'go', 'csharp'].map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={`api-tab ${sdkLanguage === lang ? 'active' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => setSdkLanguage(lang)}
                    >
                      {lang.toUpperCase()}
                    </button>
                  ))}
                </div>

                <pre className="api-code-block">
                  {renderCodeSnippet()}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
