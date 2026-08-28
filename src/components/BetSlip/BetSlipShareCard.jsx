import React, { useState } from 'react';

export default function BetSlipShareCard({ bet, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!bet) return null;

  const matchName = bet.matchName || bet.match_name || 'Cricket Match';
  const marketName = bet.marketName || bet.market_id || 'Match Winner';
  const selectionName = bet.selectionName || bet.selection_id || 'Selection';
  const odds = Number(bet.odds || bet.accepted_odds || 1.0).toFixed(2);
  const stake = Number(bet.stake || 0).toLocaleString();
  const payout = Number(bet.payout || (Number(bet.stake) * Number(odds))).toLocaleString();
  const isWon = bet.status === 'WON';

  const shareText = `🔥 My Bet on OddsYra!\n🏏 ${matchName}\n🎯 ${selectionName} @ ${odds}\n💰 Stake: ₹${stake} | Potential Return: ₹${payout}\n👉 Bet Live on https://oddsyra.com`;

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=https://oddsyra.com&text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        maxWidth: '360px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Card Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚡</span>
            <strong style={{ color: '#fff', fontSize: '1rem', letterSpacing: '0.05em' }}>ODDSYRA</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Slipshot Preview Card */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: `2px solid ${isWon ? '#10b981' : '#38bdf8'}`,
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {isWon && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '-24px',
              background: '#10b981',
              color: '#042f2e',
              fontSize: '0.68rem',
              fontWeight: 900,
              padding: '2px 28px',
              transform: 'rotate(45deg)',
            }}>
              WON
            </div>
          )}

          <div style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 600 }}>{matchName}</div>
          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '2px' }}>{marketName}</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{selectionName}</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'monospace' }}>@{odds}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase' }}>Stake</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff' }}>₹{stake}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'uppercase' }}>{isWon ? 'Won Amount' : 'Potential Return'}</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isWon ? '#10b981' : '#38bdf8' }}>₹{payout}</div>
            </div>
          </div>
        </div>

        {/* Share Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={handleShareWhatsApp}
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: '#25D366',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            Share on WhatsApp
          </button>
          <button
            type="button"
            onClick={handleShareTelegram}
            style={{
              padding: '10px',
              borderRadius: '8px',
              background: '#0088cc',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            Share on Telegram
          </button>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: '8px',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.06)',
              color: '#cbd5e1',
              border: '1px solid #334155',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied to Clipboard!' : 'Copy Share Text'}
          </button>
        </div>
      </div>
    </div>
  );
}
