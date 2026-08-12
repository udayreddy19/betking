import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ActivityIcon,
  UsersIcon,
  ChartBarIcon,
  FileTextIcon,
  WalletIcon,
  MessageCircleIcon,
  ZapIcon,
  BellRingIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SearchIcon,
  LayersIcon,
  KeyIcon,
  ChevronRightIcon,
  ChevronDownIcon,
} from '../../../icons/animate/index';
import AdminRBACGate, { ADMIN_ROLES, AdminRoleProvider, useAdminRole } from '../permissions/AdminRBACGate';
import CommandPalette from '../features/CommandPalette/CommandPalette';
import ControlTowerView from '../domains/ControlTowerView';
import CustomersDomainView from '../domains/CustomersDomainView';
import SportsDomainView from '../domains/SportsDomainView';
import TradingRiskDomainView from '../domains/TradingRiskDomainView';
import BettingDomainView from '../domains/BettingDomainView';
import FinanceDomainView from '../domains/FinanceDomainView';
import SupportDomainView from '../domains/SupportDomainView';
import GrowthDomainView from '../domains/GrowthDomainView';
import CommunicationsDomainView from '../domains/CommunicationsDomainView';
import AnalyticsDomainView from '../domains/AnalyticsDomainView';
import PlatformDomainView from '../domains/PlatformDomainView';
import OperationsDomainView from '../domains/OperationsDomainView';
import SecurityGovernanceDomainView from '../domains/SecurityGovernanceDomainView';

const DOMAIN_GROUPS = [
  {
    title: 'CORE OPERATIONS',
    items: [
      {
        id: 'control-tower',
        label: '01 · Control Tower',
        Icon: ActivityIcon,
        role: ADMIN_ROLES.SUPER_ADMIN,
        subModules: [
          { id: 'overview', label: 'Operational Overview' },
          { id: 'telemetry', label: 'Telemetry & SLA Monitors' },
          { id: 'incidents', label: 'Live System Incidents' },
        ],
      },
      {
        id: 'customers',
        label: '02 · Customers',
        Icon: UsersIcon,
        role: null,
        subModules: [
          { id: 'directory', label: 'Customer Directory' },
          { id: 'kyc-queue', label: 'KYC Verification Queue' },
          { id: 'restrictions', label: 'Account Restrictions' },
          { id: 'responsible-gaming', label: 'Responsible Gaming Safeguards' },
        ],
      },
      {
        id: 'sports',
        label: '03 · Sports',
        Icon: LayersIcon,
        role: null,
        subModules: [
          { id: 'catalog', label: 'Sports & Leagues Catalog' },
          { id: 'rosters', label: 'Team Rosters & Squads' },
          { id: 'providers', label: 'Data Feed Latency Monitors' },
        ],
      },
    ],
  },
  {
    title: 'TRADING & RISK',
    items: [
      {
        id: 'trading-risk',
        label: '04 · Trading & Risk',
        Icon: ChartBarIcon,
        role: ADMIN_ROLES.TRADING_ADMIN,
        subModules: [
          { id: 'exposure', label: 'Live Exposure & Risk Desk' },
          { id: 'suspension', label: 'Market Suspension Controls' },
          { id: 'fraud-signals', label: 'Fraud & Anomaly Signals' },
        ],
      },
      {
        id: 'betting',
        label: '05 · Betting',
        Icon: FileTextIcon,
        role: null,
        subModules: [
          { id: 'bets-registry', label: 'All Bets Registry' },
          { id: 'settlement-engine', label: 'Idempotent Settlement' },
          { id: 'cashout-reconciliation', label: 'Cashout Reconciliation' },
        ],
      },
      {
        id: 'finance',
        label: '06 · Finance',
        Icon: WalletIcon,
        role: ADMIN_ROLES.FINANCE_ADMIN,
        subModules: [
          { id: 'maker-checker', label: 'Maker-Checker Approvals' },
          { id: 'ledger', label: 'Double-Entry Ledger' },
          { id: 'payment-gateways', label: 'Razorpay & Bank Gateways' },
        ],
      },
    ],
  },
  {
    title: 'SUPPORT & GROWTH',
    items: [
      {
        id: 'support',
        label: '07 · Support',
        Icon: MessageCircleIcon,
        role: ADMIN_ROLES.SUPPORT_AGENT,
        subModules: [
          { id: 'ticket-queue', label: 'Active Support Ticket Queue' },
          { id: 'chat-console', label: 'Real-time Agent Console' },
          { id: 'sla-alerts', label: 'SLA Breach Monitoring' },
        ],
      },
      {
        id: 'growth',
        label: '08 · Growth',
        Icon: ZapIcon,
        role: ADMIN_ROLES.MARKETING_ADMIN,
        subModules: [
          { id: 'promotions', label: 'Sportsbook Campaigns' },
          { id: 'bonus-codes', label: 'Bonus Vouchers & Claims' },
          { id: 'vip-tiers', label: 'VIP Loyalty Tiers' },
        ],
      },
      {
        id: 'communications',
        label: '09 · Communications',
        Icon: BellRingIcon,
        role: null,
        subModules: [
          { id: 'dispatch-logs', label: 'Notification Delivery Logs' },
          { id: 'templates', label: 'Message Templates' },
          { id: 'dlq-retry', label: 'Dead Letter Queue Retries' },
        ],
      },
    ],
  },
  {
    title: 'PLATFORM & GOVERNANCE',
    items: [
      {
        id: 'analytics',
        label: '10 · Analytics',
        Icon: ChartBarIcon,
        role: null,
        subModules: [
          { id: 'turnover-ggr', label: 'Turnover & GGR Reports' },
          { id: 'bi-exporter', label: 'Custom BI Data Exporter' },
        ],
      },
      {
        id: 'platform',
        label: '11 · Platform',
        Icon: SettingsIcon,
        role: ADMIN_ROLES.SUPER_ADMIN,
        subModules: [
          { id: 'feature-flags', label: 'System Feature Flags' },
          { id: 'api-keys', label: 'Developer API Keys' },
        ],
      },
      {
        id: 'operations',
        label: '12 · Operations',
        Icon: KeyIcon,
        role: ADMIN_ROLES.OPERATIONS_ADMIN,
        subModules: [
          { id: 'health-matrix', label: 'Infrastructure Health Matrix' },
          { id: 'outbox-queue', label: 'Outbox Worker Telemetry' },
        ],
      },
      {
        id: 'security-governance',
        label: '13 · Security & Governance',
        Icon: ShieldCheckIcon,
        role: ADMIN_ROLES.SUPER_ADMIN,
        subModules: [
          { id: 'audit-trail', label: 'Enterprise Audit Explorer' },
          { id: 'rbac-matrix', label: 'RBAC Role Matrix' },
        ],
      },
    ],
  },
];

const ALL_DOMAINS = DOMAIN_GROUPS.flatMap((g) => g.items);

import { AdminToastProvider } from '../components/AdminToastContext';

export default function AdminShell() {
  return (
    <AdminRoleProvider>
      <AdminToastProvider>
        <AdminShellInner />
      </AdminToastProvider>
    </AdminRoleProvider>
  );
}

function AdminShellInner() {
  const [activeDomain, setActiveDomain] = useState('control-tower');
  const [activeSubModule, setActiveSubModule] = useState('overview');
  const [expandedDomains, setExpandedDomains] = useState({ 'control-tower': true, 'customers': true });
  const { activeRole, setActiveRole } = useAdminRole();
  const [globalSearch, setGlobalSearch] = useState('');
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState([
    { id: 1, title: 'Razorpay Payout Delayed', desc: 'Withdrawal #w-4401 pending gateway confirmation', time: '5m ago', type: 'CRITICAL' },
    { id: 2, title: 'High Market Exposure', desc: 'TNPL Salem Spartans winner liability exceeds ₹1,00,000', time: '18m ago', type: 'HIGH' },
    { id: 3, title: 'New High-Roller KYC', desc: 'User #usr-101 submitted documents for review', time: '42m ago', type: 'INFO' },
  ]);

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleDomainExpand = (domainId) => {
    setExpandedDomains((prev) => ({
      ...prev,
      [domainId]: !prev[domainId],
    }));
  };

  const handleDomainSelect = (domain) => {
    setActiveDomain(domain.id);
    if (domain.subModules && domain.subModules.length > 0) {
      setActiveSubModule(domain.subModules[0].id);
    }
    toggleDomainExpand(domain.id);
  };

  const handleSubModuleSelect = (domainId, subModuleId) => {
    setActiveDomain(domainId);
    setActiveSubModule(subModuleId);
  };

  const handleRoleChange = (newRole) => {
    setActiveRole(newRole);
  };

  const renderActiveDomainView = () => {
    switch (activeDomain) {
      case 'control-tower': return <ControlTowerView subModule={activeSubModule} />;
      case 'customers': return <CustomersDomainView subModule={activeSubModule} />;
      case 'sports': return <SportsDomainView subModule={activeSubModule} />;
      case 'trading-risk': return <TradingRiskDomainView subModule={activeSubModule} />;
      case 'betting': return <BettingDomainView subModule={activeSubModule} />;
      case 'finance': return <FinanceDomainView subModule={activeSubModule} />;
      case 'support': return <SupportDomainView subModule={activeSubModule} />;
      case 'growth': return <GrowthDomainView subModule={activeSubModule} />;
      case 'communications': return <CommunicationsDomainView subModule={activeSubModule} />;
      case 'analytics': return <AnalyticsDomainView subModule={activeSubModule} />;
      case 'platform': return <PlatformDomainView subModule={activeSubModule} />;
      case 'operations': return <OperationsDomainView subModule={activeSubModule} />;
      case 'security-governance': return <SecurityGovernanceDomainView subModule={activeSubModule} />;
      default: return <ControlTowerView subModule={activeSubModule} />;
    }
  };

  const currentDomainObj = ALL_DOMAINS.find((d) => d.id === activeDomain);
  const currentSubObj = currentDomainObj?.subModules?.find((s) => s.id === activeSubModule);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--admin-bg, #0b0f19)', color: 'var(--admin-text, #f9fafb)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Animated Left Sidebar Navigation */}
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ width: '280px', flexShrink: 0, background: 'var(--admin-panel, #111827)', borderRight: '1px solid var(--admin-border)', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--admin-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <motion.div
            animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{ fontSize: '1.4rem', color: '#f59e0b', display: 'inline-flex' }}
          >
            <ShieldCheckIcon style={{ width: '24px', height: '24px' }} />
          </motion.div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.5px', color: '#fff' }}>BETKING ADMIN</h1>
            <span style={{ fontSize: '0.70rem', color: '#10b981', fontWeight: 800, letterSpacing: '0.4px' }}>OPERATIONS CONTROL CENTER</span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {DOMAIN_GROUPS.map((group, idx) => (
            <div key={idx} style={{ marginBottom: '18px' }}>
              <div style={{ padding: '4px 10px 8px', fontSize: '0.66rem', fontWeight: 800, color: 'var(--admin-text-muted)', letterSpacing: '0.9px', textTransform: 'uppercase' }}>
                {group.title}
              </div>
              {group.items.map((domain) => {
                const isActive = activeDomain === domain.id;
                const isExpanded = !!expandedDomains[domain.id];
                const DomainIcon = domain.Icon;
                const hasSub = domain.subModules && domain.subModules.length > 0;

                return (
                  <div key={domain.id} style={{ marginBottom: '4px' }}>
                    {/* Unified Full-Width Domain Item Button */}
                    <motion.button
                      onClick={() => handleDomainSelect(domain)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justify: 'space-between',
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: isActive ? '1px solid rgba(59, 130, 246, 0.45)' : '1px solid transparent',
                        background: isActive ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(37, 99, 235, 0.12) 100%)' : 'transparent',
                        color: isActive ? '#60a5fa' : 'var(--admin-text-muted)',
                        fontWeight: isActive ? 800 : 600,
                        fontSize: '0.83rem',
                        cursor: 'pointer',
                        boxShadow: isActive ? '0 4px 14px rgba(59, 130, 246, 0.25)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                        <DomainIcon style={{ width: '18px', height: '18px', flexShrink: 0, color: isActive ? '#60a5fa' : 'var(--admin-text-muted)' }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{domain.label}</span>
                      </div>

                      {hasSub && (
                        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', flexShrink: 0, color: isActive ? '#60a5fa' : 'var(--admin-text-muted)' }}>
                          {isExpanded ? (
                            <ChevronDownIcon style={{ width: '15px', height: '15px' }} />
                          ) : (
                            <ChevronRightIcon style={{ width: '15px', height: '15px' }} />
                          )}
                        </div>
                      )}
                    </motion.button>

                    {/* Sleek Enterprise Tree Accordion for Sub-Modules */}
                    <AnimatePresence initial={false}>
                      {isExpanded && hasSub && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          style={{
                            overflow: 'hidden',
                            marginLeft: '26px',
                            paddingLeft: '10px',
                            borderLeft: '1.5px solid rgba(255, 255, 255, 0.12)',
                            marginTop: '4px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                          }}
                        >
                          {domain.subModules.map((sub) => {
                            const isSubActive = isActive && activeSubModule === sub.id;
                            return (
                              <motion.button
                                key={sub.id}
                                onClick={() => handleSubModuleSelect(domain.id, sub.id)}
                                whileHover={{ x: 3, color: '#60a5fa', backgroundColor: 'rgba(255, 255, 255, 0.04)' }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  width: '100%',
                                  padding: '6px 10px',
                                  borderRadius: '5px',
                                  border: 'none',
                                  background: isSubActive ? 'rgba(59, 130, 246, 0.16)' : 'transparent',
                                  color: isSubActive ? '#60a5fa' : '#9ca3af',
                                  fontWeight: isSubActive ? 700 : 500,
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub.label}</span>
                              </motion.button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--admin-border)', fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
          <div>Brand Context: <strong style={{ color: '#10b981' }}>MAIN_SPORTSBOOK</strong></div>
          <div>Server Time: <strong>{new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</strong></div>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Animated Top Header */}
        <header style={{ height: '64px', background: 'var(--admin-panel, #111827)', borderBottom: '1px solid var(--admin-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: '12px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--admin-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '320px' }}>
              Domain: <span style={{ color: '#60a5fa' }}>{currentDomainObj?.label}</span>
              {currentSubObj && <span style={{ color: 'var(--admin-text-muted)' }}> ➔ {currentSubObj.label}</span>}
            </span>

            {/* Global Search Input with Animated Search Icon */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minWidth: '220px', flex: 1, maxWidth: '320px' }}>
              <span style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                color: 'var(--admin-text-muted, #9ca3af)',
                pointerEvents: 'none',
                zIndex: 2,
              }}>
                <SearchIcon size={16} style={{ width: '16px', height: '16px', display: 'block' }} />
              </span>
              <motion.input
                whileFocus={{ scale: 1.01, borderColor: '#3b82f6', boxShadow: '0 0 10px rgba(59, 130, 246, 0.4)' }}
                type="text"
                placeholder="Global Search (⌘K / Ctrl+K)..."
                value={globalSearch}
                onClick={() => setIsCommandPaletteOpen(true)}
                onFocus={() => setIsCommandPaletteOpen(true)}
                readOnly
                style={{
                  padding: '7px 12px 7px 38px',
                  borderRadius: '20px',
                  border: '1px solid var(--admin-border)',
                  background: 'var(--admin-bg)',
                  color: 'var(--admin-text)',
                  fontSize: '0.80rem',
                  width: '100%',
                  outline: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
            {/* Live Alerts Bell Icon Button & Interactive Popover */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <motion.button
                onClick={() => setIsAlertsOpen((prev) => !prev)}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                title="Live Operational Alerts (3 Active)"
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: isAlertsOpen ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  cursor: 'pointer',
                  outline: 'none',
                  flexShrink: 0,
                  boxShadow: isAlertsOpen ? '0 0 12px rgba(239, 68, 68, 0.4)' : 'none',
                }}
              >
                <BellRingIcon size={18} style={{ width: '18px', height: '18px', display: 'block' }} />
                {liveAlerts.length > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: 900,
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid var(--admin-panel, #111827)',
                      boxShadow: '0 2px 6px rgba(239, 68, 68, 0.5)',
                      pointerEvents: 'none',
                    }}
                  >
                    {liveAlerts.length}
                  </span>
                )}
              </motion.button>

              {/* Live Alerts Popover Drawer */}
              <AnimatePresence>
                {isAlertsOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    style={{
                      position: 'absolute',
                      top: '46px',
                      right: 0,
                      width: '320px',
                      background: 'var(--admin-panel, #111827)',
                      border: '1px solid var(--admin-border)',
                      borderRadius: '12px',
                      boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
                      padding: '16px',
                      zIndex: 1000,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--admin-border)', paddingBottom: '8px' }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#fff' }}>🔔 Live Operational Alerts</span>
                      <button
                        onClick={() => setLiveAlerts([])}
                        style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Clear All
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                      {liveAlerts.length > 0 ? (
                        liveAlerts.map((alert) => (
                          <div key={alert.id} style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--admin-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: alert.type === 'CRITICAL' ? '#ef4444' : (alert.type === 'HIGH' ? '#f59e0b' : '#60a5fa') }}>
                                {alert.type}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)' }}>{alert.time}</span>
                            </div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>{alert.title}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '2px' }}>{alert.desc}</div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '0.8rem' }}>
                          No active operational alerts
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* RBAC Role Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--admin-text-muted)', fontWeight: 600 }}>Role:</span>
              <select
                value={activeRole}
                onChange={(e) => handleRoleChange(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--admin-border)',
                  background: 'var(--admin-surface)',
                  color: 'var(--admin-text)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {Object.values(ADMIN_ROLES).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            <span style={{ width: '1px', height: '18px', background: 'var(--admin-border)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.82rem', boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)', cursor: 'pointer', flexShrink: 0 }}
              >
                UR
              </motion.div>
              <div style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 700, color: '#fff' }}>Superuser</div>
                <div style={{ fontSize: '0.70rem', color: 'var(--admin-text-muted)' }}>{activeRole}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Animated Domain View Content Container */}
        <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeDomain}-${activeSubModule}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <AdminRBACGate requiredRole={currentDomainObj?.role}>
                {renderActiveDomainView()}
              </AdminRBACGate>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette isOpen={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
    </div>
  );
}
