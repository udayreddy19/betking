import { useState, useEffect } from 'react';
import { FiTrendingUp, FiDollarSign, FiActivity, FiUsers, FiDownload, FiCheckCircle, FiRefreshCw, FiPieChart } from '../../icons';
import './AdminBIConsole.css';

export default function AdminBIConsole() {
  const [execMetrics, setExecMetrics] = useState(null);
  const [betMetrics, setBetMetrics] = useState(null);
  const [finMetrics, setFinMetrics] = useState(null);
  const [funnelMetrics, setFunnelMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [downloadLink, setDownloadLink] = useState('');

  const fetchBIMetrics = async () => {
    setLoading(true);
    try {
      const [resExec, resBet, resFin, resFunnel] = await Promise.all([
        fetch('/api/v1/admin/analytics/overview'),
        fetch('/api/v1/admin/analytics/betting'),
        fetch('/api/v1/admin/analytics/finance'),
        fetch('/api/v1/admin/analytics/funnel'),
      ]);

      if (resExec.ok) setExecMetrics(await resExec.json());
      if (resBet.ok) setBetMetrics(await resBet.json());
      if (resFin.ok) setFinMetrics(await resFin.json());
      if (resFunnel.ok) setFunnelMetrics(await resFunnel.json());
    } catch (err) {
      console.error('Failed to fetch BI metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const triggerAsyncExport = async (reportType, format) => {
    setExporting(true);
    setDownloadLink('');
    try {
      const res = await fetch('/api/v1/admin/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin_user', reportType, format }),
      });
      if (res.ok) {
        const data = await res.json();
        setDownloadLink(data.downloadUrl);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchBIMetrics();
  }, []);

  return (
    <div className="admin-bi-console-container">
      {/* HEADER */}
      <div className="bi-header">
        <div className="bi-title-group">
          <FiTrendingUp className="bi-icon text-emerald-400" />
          <div>
            <h2 className="text-lg font-bold text-slate-100">Business Intelligence & Executive Analytics Console</h2>
            <p className="text-xs text-slate-400">100% Authoritative PostgreSQL Reporting & Double-Entry Ledger Reconciliation</p>
          </div>
        </div>

        <div className="bi-actions">
          <button type="button" className="bi-export-btn" onClick={() => triggerAsyncExport('FINANCIAL_LEDGER', 'CSV')} disabled={exporting}>
            <FiDownload /> {exporting ? 'Generating Report...' : 'Export Financial Ledger'}
          </button>
          <button type="button" className="bi-refresh-btn" onClick={fetchBIMetrics}>
            <FiRefreshCw className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {downloadLink && (
        <div className="bi-download-banner">
          <FiCheckCircle className="text-green-400" />
          <span>Report Generated Successfully!</span>
          <a href={downloadLink} target="_blank" rel="noreferrer">Download File</a>
        </div>
      )}

      {/* EXECUTIVE OVERVIEW METRICS GRID */}
      <div className="bi-grid">
        {/* GGR CARD */}
        <div className="bi-card">
          <div className="bi-card-label"><FiDollarSign className="text-emerald-400" /> Gross Gaming Revenue (GGR)</div>
          <div className="bi-card-value text-emerald-400">₹{(execMetrics?.betting?.ggr || 0).toLocaleString()}</div>
          <div className="bi-card-sub">Total Stake ₹{(execMetrics?.betting?.totalStake || 0).toLocaleString()} - Payout ₹{(execMetrics?.betting?.totalPayout || 0).toLocaleString()}</div>
        </div>

        {/* NGR CARD */}
        <div className="bi-card">
          <div className="bi-card-label"><FiTrendingUp className="text-blue-400" /> Net Gaming Revenue (NGR)</div>
          <div className="bi-card-value text-blue-400">₹{(execMetrics?.betting?.ngr || 0).toLocaleString()}</div>
          <div className="bi-card-sub">After bonus allocation & promotions</div>
        </div>

        {/* WALLET LIABILITY */}
        <div className="bi-card">
          <div className="bi-card-label"><FiActivity className="text-yellow-400" /> Total Wallet Liability</div>
          <div className="bi-card-value text-yellow-400">₹{(execMetrics?.finance?.walletLiability || 0).toLocaleString()}</div>
          <div className="bi-card-sub">Reconciled double-entry ledger balance</div>
        </div>

        {/* ACCEPTANCE RATE */}
        <div className="bi-card">
          <div className="bi-card-label"><FiPieChart className="text-purple-400" /> Bet Acceptance Rate</div>
          <div className="bi-card-value text-purple-400">{betMetrics?.acceptanceRate || 100}%</div>
          <div className="bi-card-sub">{betMetrics?.acceptedBets || 0} accepted / {betMetrics?.totalBets || 0} total</div>
        </div>
      </div>

      {/* DETAILED TABLES GRID */}
      <div className="bi-tables-grid mt-6">
        {/* FINANCIAL RECONCILIATION BREAKDOWN */}
        <div className="bi-card">
          <h3 className="font-bold text-sm text-slate-100 mb-3">Double-Entry Ledger Financial Breakdown</h3>
          <div className="bi-metric-row"><span>Total Ledger Credits:</span><strong className="text-green-400">₹{(finMetrics?.totalCredits || 0).toLocaleString()}</strong></div>
          <div className="bi-metric-row"><span>Total Ledger Debits:</span><strong className="text-red-400">₹{(finMetrics?.totalDebits || 0).toLocaleString()}</strong></div>
          <div className="bi-metric-row"><span>Net Ledger Balance:</span><strong className="text-cyan-400">₹{(finMetrics?.netLedgerBalance || 0).toLocaleString()}</strong></div>
          <div className="bi-metric-row"><span>Ledger ↔ Wallet Reconciled:</span><strong className={finMetrics?.isReconciled ? 'text-green-400' : 'text-red-400'}>{finMetrics?.isReconciled ? 'YES (100% BALANCED)' : 'MISMATCH'}</strong></div>
        </div>

        {/* USER CONVERSION FUNNEL */}
        <div className="bi-card">
          <h3 className="font-bold text-sm text-slate-100 mb-3"><FiUsers /> User Conversion Funnel</h3>
          <div className="bi-funnel-list">
            {funnelMetrics?.funnel?.map((step, i) => (
              <div key={i} className="bi-funnel-row">
                <span>{step.stage}</span>
                <div>
                  <strong>{step.count}</strong>
                  <span className="bi-badge">{step.conversionRate}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
