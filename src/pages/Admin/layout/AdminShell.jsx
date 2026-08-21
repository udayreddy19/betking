import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  LockIcon,
  LogOutIcon,
} from '../../../icons/animate/index';
import BrandLogo from '../../../components/BrandLogo/BrandLogo';
import AdminRBACGate, { ADMIN_ROLES, AdminRoleProvider, useAdminRole } from '../permissions/AdminRBACGate';
import CommandPalette from '../features/CommandPalette/CommandPalette';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import { useTheme } from '../../../context/ThemeContext';
import { startVisibleInterval } from '../utils/visibleInterval';
import AdminMfaQr from '../components/AdminMfaQr';
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
import { ensureAdminSession, adminApiClient } from '../api/adminApiClient';
import { AdminToastProvider } from '../components/AdminToastContext';

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
          { id: 'iplsrl-console', label: 'IPLSRL Console' },
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
          { id: 'ggr-liability', label: 'GGR / Hold / Liability' },
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
          { id: 'bonus-codes', label: 'Signup Promo Codes' },
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
          { id: 'database-tables', label: 'Database Tables' },
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
const DEFAULT_ADMIN_DOMAIN = 'control-tower';
const DEFAULT_ADMIN_SUB = 'overview';
const ADMIN_NAV_STORAGE_KEY = 'adminNavLocation';

function resolveAdminNav(domainId, subModuleId) {
  const domain = ALL_DOMAINS.find((d) => d.id === domainId) || ALL_DOMAINS.find((d) => d.id === DEFAULT_ADMIN_DOMAIN);
  const resolvedDomain = domain?.id || DEFAULT_ADMIN_DOMAIN;
  const subs = domain?.subModules || [];
  const resolvedSub = subs.some((s) => s.id === subModuleId)
    ? subModuleId
    : (subs[0]?.id || DEFAULT_ADMIN_SUB);
  return { domainId: resolvedDomain, subModuleId: resolvedSub };
}

function parseAdminPath(pathname) {
  const parts = String(pathname || '')
    .replace(/^\/admin\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  return {
    domainId: parts[0] || null,
    subModuleId: parts[1] || null,
  };
}

function adminPathFor(domainId, subModuleId) {
  return `/admin/${encodeURIComponent(domainId)}/${encodeURIComponent(subModuleId)}`;
}

function readStoredAdminNav() {
  try {
    const raw = sessionStorage.getItem(ADMIN_NAV_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.domainId) return resolveAdminNav(parsed.domainId, parsed.subModuleId);
  } catch { /* ignore */ }
  try {
    const domainId = sessionStorage.getItem('adminLandingDomain');
    const subModuleId = sessionStorage.getItem('adminLandingSubModule');
    if (domainId) return resolveAdminNav(domainId, subModuleId);
  } catch { /* ignore */ }
  return null;
}

function persistAdminNav(domainId, subModuleId) {
  try {
    sessionStorage.setItem(ADMIN_NAV_STORAGE_KEY, JSON.stringify({ domainId, subModuleId }));
    sessionStorage.setItem('adminLandingDomain', domainId);
    sessionStorage.setItem('adminLandingSubModule', subModuleId);
  } catch { /* ignore */ }
}

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
  const location = useLocation();
  const navigate = useNavigate();

  const initialNav = (() => {
    const fromUrl = parseAdminPath(location.pathname);
    if (fromUrl.domainId) return resolveAdminNav(fromUrl.domainId, fromUrl.subModuleId);
    return readStoredAdminNav() || resolveAdminNav(DEFAULT_ADMIN_DOMAIN, DEFAULT_ADMIN_SUB);
  })();

  const [activeDomain, setActiveDomain] = useState(initialNav.domainId);
  const [activeSubModule, setActiveSubModule] = useState(initialNav.subModuleId);
  const [expandedDomains, setExpandedDomains] = useState(() => ({
    'control-tower': true,
    customers: true,
    [initialNav.domainId]: true,
  }));

  const syncAdminLocation = useCallback((domainId, subModuleId, { replace = false } = {}) => {
    const next = resolveAdminNav(domainId, subModuleId);
    persistAdminNav(next.domainId, next.subModuleId);
    const target = adminPathFor(next.domainId, next.subModuleId);
    if (location.pathname !== target) {
      navigate(target, { replace });
    }
    return next;
  }, [location.pathname, navigate]);

  // Keep React state aligned when URL changes (refresh, back/forward, deep links).
  useEffect(() => {
    const fromUrl = parseAdminPath(location.pathname);
    if (!fromUrl.domainId) {
      const stored = readStoredAdminNav() || resolveAdminNav(DEFAULT_ADMIN_DOMAIN, DEFAULT_ADMIN_SUB);
      syncAdminLocation(stored.domainId, stored.subModuleId, { replace: true });
      return;
    }
    const next = resolveAdminNav(fromUrl.domainId, fromUrl.subModuleId);
    setActiveDomain(next.domainId);
    setActiveSubModule(next.subModuleId);
    setExpandedDomains((prev) => ({ ...prev, [next.domainId]: true }));
    persistAdminNav(next.domainId, next.subModuleId);
    const canonical = adminPathFor(next.domainId, next.subModuleId);
    if (location.pathname !== canonical) {
      navigate(canonical, { replace: true });
    }
  }, [location.pathname, navigate, syncAdminLocation]);

  const { activeRole, setActiveRole } = useAdminRole();
  const { isDark } = useTheme();
  const [globalSearch, setGlobalSearch] = useState('');
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [paletteSeedQuery, setPaletteSeedQuery] = useState('');
  const [sessionReady, setSessionReady] = useState(!!localStorage.getItem('adminToken'));
  const [sessionChecking, setSessionChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminTotp, setAdminTotp] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaOtpauth, setMfaOtpauth] = useState('');
  const [mfaStep, setMfaStep] = useState('password');
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [alertsMenuPos, setAlertsMenuPos] = useState({ top: 56, right: 16 });
  const contentScrollRef = useRef(null);
  const alertsBellRef = useRef(null);
  const alertsMenuRef = useRef(null);

  const scrollContentToTop = () => {
    const run = () => {
      const el = contentScrollRef.current;
      if (el) {
        el.scrollTop = 0;
        el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const appMain = document.querySelector('.app-main');
      if (appMain) appMain.scrollTop = 0;
    };
    run();
    requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    setTimeout(run, 50);
    setTimeout(run, 180);
  };

  useEffect(() => {
    scrollContentToTop();
  }, [activeDomain, activeSubModule]);

  React.useEffect(() => {
    let cancelled = false;
    setSessionChecking(true);
    ensureAdminSession(activeRole)
      .then(() => {
        if (cancelled) return;
        setSessionReady(true);
        setSessionError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setSessionReady(false);
        if (err.code === 'MFA_REQUIRED' && err.mfaToken) {
          setMfaToken(err.mfaToken);
          setMfaStep('otp');
          setSessionError('Enter the 6-digit code from your authenticator app.');
          return;
        }
        if (err.code === 'MFA_SETUP_REQUIRED' && err.mfaToken) {
          setMfaToken(err.mfaToken);
          setMfaSecret(err.secret || '');
          setMfaOtpauth(err.otpauthUrl || '');
          setMfaStep('setup');
          setSessionError('Scan or enter this secret in your authenticator, then confirm the code.');
          return;
        }
        setSessionError(err.message || 'Sign in with an admin account to continue.');
      })
      .finally(() => {
        if (cancelled) return;
        setSessionChecking(false);
      });
    return () => { cancelled = true; };
  }, [activeRole]);

  React.useEffect(() => {
    if (!sessionReady) return undefined;
    let cancelled = false;
    const loadAlerts = () => {
      ensureAdminSession(activeRole)
        .then(() => Promise.all([
          adminApiClient.get('/control-tower/metrics').catch(() => ({})),
          adminApiClient.get('/notifications/v2/notifications?unreadOnly=true&limit=40').catch(() => ({ notifications: [] })),
        ]))
        .then(([data, notifPayload]) => {
          if (cancelled) return;
          const alerts = [];
          Object.entries(data.providerSources || {}).forEach(([name, status]) => {
            if (status === 'error') {
              alerts.push({
                id: `feed-${name}`,
                title: `${name} feed degraded`,
                desc: 'Aggregator reported provider error on last refresh',
                category: 'sports',
                domainId: 'sports',
                subModuleId: 'providers',
                type: 'CRITICAL',
              });
            }
          });
          if ((data.pendingWithdrawals || 0) > 0) {
            alerts.push({
              id: 'wd',
              title: 'Withdrawals pending approval',
              desc: `${data.pendingWithdrawals} request(s) in finance queue`,
              category: 'finance',
              domainId: 'finance',
              subModuleId: 'maker-checker',
              type: 'HIGH',
            });
          }
          if ((data.openTickets || 0) > 0) {
            alerts.push({
              id: 'tickets',
              title: 'Open support tickets',
              desc: `${data.openTickets} ticket(s) awaiting attention`,
              category: 'support',
              domainId: 'support',
              subModuleId: 'ticket-queue',
              type: (data.openTickets || 0) > 10 ? 'HIGH' : 'INFO',
            });
          }
          if ((data.riskAlerts || 0) > 0) {
            alerts.push({
              id: 'risk',
              title: 'Provider risk alerts',
              desc: `${data.riskAlerts} feed error(s)`,
              category: 'trading',
              domainId: 'trading-risk',
              subModuleId: 'fraud-signals',
              type: 'CRITICAL',
            });
          }

          (notifPayload.notifications || []).forEach((n) => {
            const isSupport = String(n.category || '').toUpperCase() === 'SUPPORT'
              || String(n.action_target_type || '') === 'support_conversation';
            alerts.push({
              id: n.notification_id,
              title: n.title || 'Admin alert',
              desc: n.message || '',
              category: isSupport ? 'support' : String(n.category || 'ops').toLowerCase(),
              domainId: isSupport ? 'support' : 'control-tower',
              subModuleId: isSupport ? 'ticket-queue' : 'overview',
              type: String(n.priority || 'HIGH').toUpperCase() === 'URGENT' ? 'CRITICAL' : 'HIGH',
              notificationId: n.notification_id,
              conversationId: n.action_target_id || null,
            });
          });

          // De-dupe by id while keeping newest support alerts visible
          const seen = new Set();
          setLiveAlerts(alerts.filter((a) => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          }));
        })
        .catch(() => {
          if (!cancelled) setLiveAlerts([]);
        });
    };
    const stop = startVisibleInterval(loadAlerts, 30000, { runImmediately: true });
    return () => {
      cancelled = true;
      stop();
    };
  }, [sessionReady, activeRole]);

  React.useEffect(() => {
    if (!sessionReady) return undefined;
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        if (!isCommandPaletteOpen) setPaletteSeedQuery(globalSearch.trim());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalSearch, isCommandPaletteOpen, sessionReady]);

  const toggleDomainExpand = (domainId) => {
    setExpandedDomains((prev) => ({
      ...prev,
      [domainId]: !prev[domainId],
    }));
  };

  const handleDomainSelect = (domain) => {
    const hasSub = !!(domain.subModules && domain.subModules.length > 0);
    const isAlreadyActive = activeDomain === domain.id;
    const isExpanded = !!expandedDomains[domain.id];

    // Re-clicking an expanded active domain collapses it (accordion behavior).
    if (hasSub && isAlreadyActive && isExpanded) {
      setExpandedDomains((prev) => ({ ...prev, [domain.id]: false }));
      return;
    }

    const nextSub = hasSub ? domain.subModules[0].id : activeSubModule;
    setActiveDomain(domain.id);
    if (hasSub) {
      setActiveSubModule(nextSub);
      setExpandedDomains((prev) => ({ ...prev, [domain.id]: true }));
    }
    syncAdminLocation(domain.id, nextSub);
    scrollContentToTop();
  };

  const handleSubModuleSelect = (domainId, subModuleId) => {
    setActiveDomain(domainId);
    setActiveSubModule(subModuleId);
    setExpandedDomains((prev) => ({ ...prev, [domainId]: true }));
    syncAdminLocation(domainId, subModuleId);
    scrollContentToTop();
  };

  const openCommandPalette = (seed = globalSearch) => {
    setPaletteSeedQuery(seed || '');
    setIsCommandPaletteOpen(true);
  };

  const handleGlobalSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openCommandPalette(globalSearch.trim());
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette(globalSearch.trim());
    }
  };

  const handleCommandNavigate = ({ domainId, subModuleId }) => {
    if (!domainId) return;
    const domain = ALL_DOMAINS.find((d) => d.id === domainId);
    const nextSub = subModuleId
      || domain?.subModules?.[0]?.id
      || activeSubModule;
    flushSync(() => {
      setActiveDomain(domainId);
      setExpandedDomains((prev) => ({ ...prev, [domainId]: true }));
      setActiveSubModule(nextSub);
      setIsAlertsOpen(false);
    });
    syncAdminLocation(domainId, nextSub);
    scrollContentToTop();
  };

  const openAlertsMenu = () => {
    const rect = alertsBellRef.current?.getBoundingClientRect();
    if (rect) {
      setAlertsMenuPos({
        top: Math.round(rect.bottom + 10),
        right: Math.max(12, Math.round(window.innerWidth - rect.right)),
      });
    }
    setIsAlertsOpen(true);
  };

  const handleAlertClick = (event, alert) => {
    event.preventDefault();
    event.stopPropagation();
    if (alert?.notificationId) {
      adminApiClient.post(`/notifications/v2/notifications/${alert.notificationId}/read`).catch(() => {});
      setLiveAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    }
    if (!alert?.domainId) return;
    handleCommandNavigate({
      domainId: alert.domainId,
      subModuleId: alert.subModuleId,
    });
  };

  const handleAdminSignIn = async (event) => {
    event.preventDefault();
    setSigningIn(true);
    setSessionError('');
    try {
      if (mfaStep !== 'password') {
        await ensureAdminSession(activeRole, {
          totpCode: adminTotp,
          mfaToken,
          enroll: mfaStep === 'setup',
        });
      } else {
        await ensureAdminSession(activeRole, { email: adminEmail, password: adminPassword });
      }
      setSessionReady(true);
      setAdminTotp('');
      setMfaToken('');
      setMfaSecret('');
      setMfaStep('password');
    } catch (err) {
      if (err.code === 'MFA_REQUIRED' && err.mfaToken) {
        setMfaToken(err.mfaToken);
        setMfaStep('otp');
        setSessionError('Enter the 6-digit code from your authenticator app.');
      } else if (err.code === 'MFA_SETUP_REQUIRED' && err.mfaToken) {
        setMfaToken(err.mfaToken);
        setMfaSecret(err.secret || '');
        setMfaOtpauth(err.otpauthUrl || '');
        setMfaStep('setup');
        setSessionError('Scan or enter this secret in your authenticator, then confirm the code.');
      } else {
        setSessionReady(false);
        setSessionError(err.message || 'Could not sign in to admin.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminRole');
    setSessionReady(false);
    setSessionError('');
    setAdminTotp('');
    setMfaToken('');
    setMfaSecret('');
    setMfaOtpauth('');
    setMfaStep('password');
  };

  const handleRoleChange = (newRole) => {
    setActiveRole(newRole);
  };

  useEffect(() => {
    if (!isAlertsOpen) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (alertsBellRef.current?.contains(target)) return;
      if (alertsMenuRef.current?.contains(target)) return;
      setIsAlertsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsAlertsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isAlertsOpen]);

  // If initial session verification is underway and not ready yet, show sleek spinner
  if (sessionChecking && !sessionReady) {
    return (
      <div
        className={`admin-shell ${isDark ? 'admin-shell--dark' : 'admin-shell--light'}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--admin-bg, #0b0f19)',
          color: 'var(--admin-text, #f9fafb)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          gap: '16px',
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        >
          <BrandLogo size={52} />
        </motion.div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.6px' }}>ODDSYRA ADMIN</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
            Verifying security session…
          </div>
        </div>
      </div>
    );
  }

  // If unauthenticated, render a clean, secure login screen without sidebar or profile
  if (!sessionReady) {
    return (
      <div
        className={`admin-shell ${isDark ? 'admin-shell--dark' : 'admin-shell--light'}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          height: '100vh',
          background: 'var(--admin-bg, #0b0f19)',
          color: 'var(--admin-text, #f9fafb)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          overflow: 'auto',
        }}
      >
        {/* Top Navbar */}
        <header
          style={{
            height: '60px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: '1px solid var(--admin-border)',
            background: 'var(--admin-panel)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <BrandLogo size={34} />
            <div>
              <div style={{ fontSize: '0.96rem', fontWeight: 900, letterSpacing: '0.4px', color: 'var(--admin-text)' }}>
                ODDSYRA ADMIN
              </div>
              <div style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 800, letterSpacing: '0.3px' }}>
                OPERATIONS CONTROL CENTER
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <ThemeToggle />
            <Link
              to="/"
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--admin-text-muted)',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--admin-border)',
                background: 'var(--admin-surface)',
                transition: 'all 0.15s ease',
              }}
            >
              ← Back to Sportsbook
            </Link>
          </div>
        </header>

        {/* Center Login Container */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 16px',
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{
              width: '100%',
              maxWidth: '440px',
              background: 'var(--admin-panel)',
              border: '1px solid var(--admin-border)',
              borderRadius: '16px',
              padding: '32px 28px',
              boxShadow: 'var(--admin-shadow)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#3b82f6',
                  marginBottom: '14px',
                }}
              >
                <LockIcon size={24} />
              </div>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)' }}>
                Admin Sign In
              </h2>
              <p style={{ margin: 0, color: 'var(--admin-text-muted)', fontSize: '0.86rem', lineHeight: 1.45 }}>
                Sign in with an authorized administrator account to open the Operations Control Center.
              </p>
            </div>

            {sessionError && (
              <div
                style={{
                  marginBottom: '18px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>⚠️</span>
                <span>{sessionError}</span>
              </div>
            )}

            <form onSubmit={handleAdminSignIn} style={{ display: 'grid', gap: '16px' }}>
              {mfaStep === 'password' && (
                <>
              <label style={{ display: 'grid', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                ADMIN EMAIL
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  placeholder="admin@oddsyra.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--admin-border)',
                    background: 'var(--admin-bg)',
                    color: 'var(--admin-text)',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                PASSWORD
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--admin-border)',
                    background: 'var(--admin-bg)',
                    color: 'var(--admin-text)',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </label>
                </>
              )}

              {mfaStep !== 'password' && (
                <>
                  {mfaStep === 'setup' && mfaSecret && (
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--admin-border)',
                      background: 'var(--admin-bg)',
                      fontSize: '0.8rem',
                      color: 'var(--admin-text)',
                      wordBreak: 'break-all',
                    }}>
                      <div style={{ fontWeight: 800, marginBottom: 10 }}>Set up authenticator</div>
                      {mfaOtpauth && (
                        <div style={{ marginBottom: 12 }}>
                          <AdminMfaQr otpauthUrl={mfaOtpauth} size={200} />
                          <div style={{ marginTop: 8, color: 'var(--admin-text-muted)', fontSize: '0.72rem', textAlign: 'center' }}>
                            Scan with Google Authenticator, 1Password, or Authy
                          </div>
                        </div>
                      )}
                      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.72rem', color: 'var(--admin-text-muted)' }}>
                        Or enter this secret manually
                      </div>
                      <code style={{ display: 'block', fontSize: '0.78rem' }}>{mfaSecret}</code>
                      <div style={{ marginTop: 8, color: 'var(--admin-text-muted)', fontSize: '0.72rem' }}>
                        Delete any old OddsYra Admin entries first, then scan or paste the secret.
                        Wait for a fresh 6-digit code before confirming.
                      </div>
                    </div>
                  )}
                  <label style={{ display: 'grid', gap: '6px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>
                    AUTHENTICATOR CODE
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      autoFocus
                      maxLength={8}
                      placeholder="123456"
                      value={adminTotp}
                      onChange={(e) => setAdminTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--admin-border)',
                        background: 'var(--admin-bg)',
                        color: 'var(--admin-text)',
                        fontSize: '0.9rem',
                        outline: 'none',
                        letterSpacing: '0.2em',
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaStep('password');
                      setAdminTotp('');
                      setMfaToken('');
                      setMfaSecret('');
                      setMfaOtpauth('');
                      setSessionError('');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--admin-text-muted)',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: 0,
                    }}
                  >
                    Back to email and password
                  </button>
                </>
              )}

              <button
                type="submit"
                disabled={signingIn}
                style={{
                  marginTop: '8px',
                  padding: '12px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.92rem',
                  cursor: signingIn ? 'wait' : 'pointer',
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                  transition: 'all 0.15s ease',
                  opacity: signingIn ? 0.75 : 1,
                }}
              >
                {signingIn
                  ? 'Verifying…'
                  : mfaStep === 'setup'
                    ? 'Confirm authenticator'
                    : mfaStep === 'otp'
                      ? 'Verify code'
                      : 'Sign In to Operations Console'}
              </button>
            </form>

            <div
              style={{
                marginTop: '22px',
                paddingTop: '16px',
                borderTop: '1px solid var(--admin-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                color: 'var(--admin-text-muted)',
                fontSize: '0.74rem',
              }}
            >
              <ShieldCheckIcon size={14} style={{ color: '#10b981' }} />
              <span>RBAC &amp; Audit Logging Enforced</span>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const renderActiveDomainView = () => {
    switch (activeDomain) {
      case 'control-tower': return (
        <ControlTowerView
          subModule={activeSubModule}
          onSubModuleChange={(id) => handleSubModuleSelect('control-tower', id)}
          onNavigate={handleCommandNavigate}
        />
      );
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
      default: return (
        <ControlTowerView
          subModule={activeSubModule}
          onNavigate={handleCommandNavigate}
        />
      );
    }
  };

  const currentDomainObj = ALL_DOMAINS.find((d) => d.id === activeDomain);

  return (
    <div className={`admin-shell ${isDark ? 'admin-shell--dark' : 'admin-shell--light'}`} style={{ color: 'var(--admin-text, #f9fafb)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Animated Left Sidebar Navigation */}
      <motion.aside
        className="admin-shell__sidebar"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        style={{ background: 'var(--admin-panel)', borderRight: '1px solid var(--admin-border)' }}
      >
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--admin-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BrandLogo size={36} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.5px', color: 'var(--admin-text)' }}>ODDSYRA ADMIN</h1>
            <span style={{ fontSize: '0.70rem', color: '#10b981', fontWeight: 800, letterSpacing: '0.4px' }}>OPERATIONS CONTROL CENTER</span>
          </div>
        </div>

        <nav className="admin-shell__sidebar-nav" style={{ padding: '12px 10px' }}>
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
                  <div key={domain.id} className="admin-nav-item">
                    <div className="admin-nav-domain-row">
                      <button
                        type="button"
                        className={`admin-nav-domain${isActive ? ' is-active' : ''}`}
                        onClick={() => handleDomainSelect(domain)}
                        aria-expanded={hasSub ? isExpanded : undefined}
                      >
                        <DomainIcon className="admin-nav-domain__icon" />
                        <span className="admin-nav-domain__label">{domain.label}</span>
                      </button>
                      {hasSub && (
                        <button
                          type="button"
                          className={`admin-nav-chevron${isExpanded ? ' is-open' : ''}${isActive ? ' is-active' : ''}`}
                          aria-label={isExpanded ? `Collapse ${domain.label}` : `Expand ${domain.label}`}
                          onClick={() => toggleDomainExpand(domain.id)}
                        >
                          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </button>
                      )}
                    </div>

                    {isExpanded && hasSub && (
                      <div className="admin-nav-subs">
                        {domain.subModules.map((sub) => {
                          const isSubActive = isActive && activeSubModule === sub.id;
                          return (
                            <button
                              key={sub.id}
                              type="button"
                              className={`admin-nav-sub${isSubActive ? ' is-active' : ''}`}
                              onClick={() => handleSubModuleSelect(domain.id, sub.id)}
                            >
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
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
      <div className="admin-shell__column">

        {/* Animated Top Header */}
        <header style={{ height: '64px', flexShrink: 0, background: 'var(--admin-panel)', borderBottom: '1px solid var(--admin-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', gap: '12px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
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
                type="search"
                placeholder="Global Search (⌘K / Ctrl+K)..."
                value={globalSearch}
                onChange={(e) => {
                  const next = e.target.value;
                  setGlobalSearch(next);
                  if (next.trim().length >= 2) openCommandPalette(next.trim());
                }}
                onKeyDown={handleGlobalSearchKeyDown}
                onClick={() => openCommandPalette(globalSearch)}
                style={{
                  padding: '7px 12px 7px 38px',
                  borderRadius: '20px',
                  border: '1px solid var(--admin-border)',
                  background: 'var(--admin-bg)',
                  color: 'var(--admin-text)',
                  fontSize: '0.80rem',
                  width: '100%',
                  outline: 'none',
                  cursor: 'text',
                  transition: 'all 0.15s ease',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <ThemeToggle />

            {/* Live Alerts Bell Icon Button & Interactive Popover */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <motion.button
                ref={alertsBellRef}
                type="button"
                onClick={() => {
                  if (isAlertsOpen) setIsAlertsOpen(false);
                  else openAlertsMenu();
                }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                title={liveAlerts.length ? `Live Operational Alerts (${liveAlerts.length})` : 'No operational alerts'}
                aria-expanded={isAlertsOpen}
                aria-haspopup="dialog"
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: isAlertsOpen
                    ? (liveAlerts.length ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.25)')
                    : (liveAlerts.length ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.12)'),
                  color: liveAlerts.length ? '#ef4444' : '#60a5fa',
                  border: liveAlerts.length ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(59, 130, 246, 0.35)',
                  cursor: 'pointer',
                  outline: 'none',
                  flexShrink: 0,
                  boxShadow: isAlertsOpen && liveAlerts.length ? '0 0 12px rgba(239, 68, 68, 0.4)' : 'none',
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
                      border: '2px solid var(--admin-panel)',
                      boxShadow: '0 2px 6px rgba(239, 68, 68, 0.5)',
                      pointerEvents: 'none',
                    }}
                  >
                    {liveAlerts.length}
                  </span>
                )}
              </motion.button>

              {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                  {isAlertsOpen && (
                    <motion.div
                      ref={alertsMenuRef}
                      role="dialog"
                      aria-label="Live Operational Alerts"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      style={{
                        position: 'fixed',
                        top: alertsMenuPos.top,
                        right: alertsMenuPos.right,
                        width: '340px',
                        maxWidth: 'calc(100vw - 24px)',
                        background: 'var(--admin-panel)',
                        border: '1px solid var(--admin-border)',
                        borderRadius: '12px',
                        boxShadow: 'var(--admin-shadow)',
                        padding: '16px',
                        zIndex: 100000,
                        color: 'var(--admin-text)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--admin-border)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 800 }}>Live Operational Alerts</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            adminApiClient.post('/notifications/v2/notifications/read-all').catch(() => {});
                            setLiveAlerts([]);
                          }}
                          style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Clear All
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto' }}>
                        {liveAlerts.length > 0 ? (
                          liveAlerts.map((alert) => (
                            <button
                              key={alert.id}
                              type="button"
                              onClick={(e) => handleAlertClick(e, alert)}
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '12px',
                                borderRadius: '10px',
                                background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.03)',
                                border: '1px solid var(--admin-border)',
                                cursor: 'pointer',
                                color: 'inherit',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: alert.type === 'CRITICAL' ? '#ef4444' : (alert.type === 'HIGH' ? '#f59e0b' : '#60a5fa') }}>
                                  {alert.type}
                                </span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)' }}>{alert.category || 'ops'}</span>
                              </div>
                              <div style={{ fontSize: '0.84rem', fontWeight: 750, color: 'var(--admin-text)' }}>{alert.title}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '2px' }}>{alert.desc}</div>
                              <div style={{ fontSize: '0.7rem', color: '#60a5fa', marginTop: '10px', fontWeight: 750 }}>
                                Go to {alert.category || 'section'} →
                              </div>
                            </button>
                          ))
                        ) : (
                          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '0.8rem' }}>
                            No active operational alerts
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body,
              )}
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

            {/* Authenticated Admin Profile Avatar & Sign Out */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)',
                  flexShrink: 0,
                }}
              >
                UR
              </motion.div>
              <div style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 700, color: 'var(--admin-text)' }}>Superuser</div>
                <div style={{ fontSize: '0.70rem', color: 'var(--admin-text-muted)' }}>{activeRole}</div>
              </div>

              <motion.button
                type="button"
                onClick={handleAdminLogout}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                title="Sign out of Admin Console"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  marginLeft: '4px',
                  borderRadius: '6px',
                  border: '1px solid var(--admin-border)',
                  background: 'var(--admin-surface)',
                  color: 'var(--admin-text-muted)',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--admin-text-muted)';
                  e.currentTarget.style.borderColor = 'var(--admin-border)';
                  e.currentTarget.style.background = 'var(--admin-surface)';
                }}
              >
                <LogOutIcon size={14} />
              </motion.button>
            </div>
          </div>
        </header>

        {/* Animated Domain View Content Container */}
        <main ref={contentScrollRef} className="admin-shell__main">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeDomain}-${activeSubModule}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onAnimationComplete={scrollContentToTop}
            >
              <AdminRBACGate requiredRole={currentDomainObj?.role} domainId={activeDomain}>
                {renderActiveDomainView()}
              </AdminRBACGate>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        initialQuery={paletteSeedQuery}
        onNavigate={handleCommandNavigate}
      />
    </div>
  );
}

