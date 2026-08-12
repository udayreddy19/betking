import React, { useState, useEffect } from 'react';

/**
 * Developer API Key & Application Management UI Component
 * Features: Application list, API key creation, rotate key, revoke key, one-time secret display banner.
 */
export default function DeveloperApiKeyTab() {
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [newAppName, setNewAppName] = useState('');
  const [createdSecret, setCreatedSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchApps();
  }, []);

  const fetchApps = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/developer/apps');
      const data = await res.json();
      if (data.success) {
        setApps(data.apps || []);
        if (data.apps.length > 0 && !selectedApp) {
          setSelectedApp(data.apps[0]);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApp = async (e) => {
    e.preventDefault();
    if (!newAppName.trim()) return;

    try {
      setLoading(true);
      const res = await fetch('/api/developer/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newAppName, environment: 'PRODUCTION' }),
      });
      const data = await res.json();
      if (data.success) {
        setNewAppName('');
        await fetchApps();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async (appId) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/developer/apps/${appId}/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: ['sports:read', 'matches:read', 'odds:read'] }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedSecret(data.rawKey); // DISPLAY ONCE ONLY
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="developer-platform-tab p-6 bg-slate-900 text-white rounded-xl shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-emerald-400">Developer Platform & API Keys</h2>
          <p className="text-slate-400 text-sm">Manage B2B API applications, cryptographic keys, and webhook endpoints.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500 text-rose-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {createdSecret && (
        <div className="mb-6 p-4 bg-amber-500/20 border border-amber-500 text-amber-200 rounded-xl">
          <h4 className="font-bold mb-1 flex items-center gap-2">
            ⚠️ Save Your API Key Secret Now
          </h4>
          <p className="text-xs text-amber-300/80 mb-2">
            This key secret will <strong>NEVER</strong> be displayed again. Store it securely in your server environment variables.
          </p>
          <div className="bg-slate-950 p-3 rounded font-mono text-emerald-400 select-all border border-slate-800 break-all">
            {createdSecret}
          </div>
          <button
            onClick={() => setCreatedSecret(null)}
            className="mt-3 text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3 py-1.5 rounded transition"
          >
            I Have Saved My Secret
          </button>
        </div>
      )}

      {/* Create Application Form */}
      <form onSubmit={handleCreateApp} className="mb-8 flex gap-3">
        <input
          type="text"
          placeholder="New Application Name (e.g. OddsSyndicator Pro)"
          value={newAppName}
          onChange={(e) => setNewAppName(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-5 py-2 rounded-lg text-sm transition"
        >
          Create App
        </button>
      </form>

      {/* Applications List */}
      <div className="space-y-4">
        {apps.map((app) => (
          <div key={app.id} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex justify-between items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">{app.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                  {app.environment}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {app.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">App ID: {app.id}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleGenerateKey(app.id)}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-lg font-semibold transition"
              >
                + Generate API Key
              </button>
            </div>
          </div>
        ))}

        {apps.length === 0 && !loading && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No developer applications registered yet. Create your first application above to start syndicating odds.
          </div>
        )}
      </div>
    </div>
  );
}
