import React, { useState } from 'react';
import { verifyCrashMultiplier, verifyDiceRoll } from '../../utils/provablyFairCalculator';

export default function ProvablyFairModal({ onClose }) {
  const [gameType, setGameType] = useState('CRASH');
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('1');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!serverSeed || !clientSeed) return;
    setLoading(true);
    try {
      if (gameType === 'CRASH') {
        const res = await verifyCrashMultiplier(serverSeed.trim(), clientSeed.trim(), Number(nonce) || 0);
        setResult(res);
      } else {
        const res = await verifyDiceRoll(serverSeed.trim(), clientSeed.trim(), Number(nonce) || 0);
        setResult(res);
      }
    } catch {
      setResult({ error: 'Failed to compute cryptographic hash.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px',
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>🛡️ Provably Fair Verifier</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#94a3b8' }}>Cryptographic HMAC-SHA256 outcome verification</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Game Selector */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          <button
            type="button"
            onClick={() => { setGameType('CRASH'); setResult(null); }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: `1px solid ${gameType === 'CRASH' ? '#3b82f6' : '#334155'}`,
              background: gameType === 'CRASH' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: gameType === 'CRASH' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            🚀 Aviator / Crash
          </button>
          <button
            type="button"
            onClick={() => { setGameType('DICE'); setResult(null); }}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: `1px solid ${gameType === 'DICE' ? '#3b82f6' : '#334155'}`,
              background: gameType === 'DICE' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              color: gameType === 'DICE' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            🎲 Dice Roll
          </button>
        </div>

        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>Server Seed (Unmasked)</label>
            <input
              type="text"
              required
              value={serverSeed}
              onChange={(e) => setServerSeed(e.target.value)}
              placeholder="e.g. b82c89f..."
              style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.82rem', fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>Client Seed</label>
              <input
                type="text"
                required
                value={clientSeed}
                onChange={(e) => setClientSeed(e.target.value)}
                placeholder="User seed"
                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.82rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>Nonce</label>
              <input
                type="number"
                min="0"
                required
                value={nonce}
                onChange={(e) => setNonce(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', color: '#fff', fontSize: '0.82rem' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '6px',
              padding: '10px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Verifying Hash…' : 'Verify Round Result'}
          </button>
        </form>

        {result && (
          <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 800, textTransform: 'uppercase' }}>
              ✓ Verified Outcome
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', marginTop: '4px' }}>
              {gameType === 'CRASH' ? `${result.multiplier}x Multiplier` : `Dice Roll: ${result.roll}`}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '6px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              HMAC: {result.hash}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
