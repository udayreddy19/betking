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
import SupportHeadsetIcon from '../../../icons/SupportHeadsetIcon';
import BrandLogo from '../../../components/BrandLogo/BrandLogo';
import AdminRBACGate, { ADMIN_ROLES, AdminRoleProvider, useAdminRole } from '../permissions/AdminRBACGate';
import CommandPalette from '../features/CommandPalette/CommandPalette';
import ThemeToggle from '../../../components/ThemeToggle/ThemeToggle';
import { useTheme } from '../../../context/ThemeContext';
import { startVisibleInterval } from '../utils/visibleInterval';
import AdminMfaQr from '../components/AdminMfaQr';
import AdminSidebar from './AdminSidebar';
import AdminTopbar from './AdminTopbar';
import AdminLogin from './AdminLogin';
import AdminStatusBar from '../components/AdminStatusBar';
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
          { id: 'kyc-reminders', label: 'KYC Reminders & Email' },
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
          { id: 'bets-registry', label: 'All Bets' },
          { id: 'settlement-engine', label: 'Pending & Declare' },
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
          { id: 'finance-health', label: 'Finance Health Center' },
          { id: 'ledger', label: 'Double-Entry Ledger' },
          { id: 'legacy-ledger', label: 'Legacy Ledger Gaps' },
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
        Icon: SupportHeadsetIcon,
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
          { id: 'referrals', label: 'Referral Program' },
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
          { id: 'broadcast', label: 'Broadcast Notification' },
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
          { id: 'settlement-queue', label: 'Settlement Queue' },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [alertsMenuPos, setAlertsMenuPos] = useState({ top: 56, right: 16 });
  const [focusNav, setFocusNav] = useState(null); // { entityType, entityId }
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

  // Session bootstrap
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

  // Live alerts polling
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

          // De-dupe by id
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

  // Command palette hotkey
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

  // ─── Navigation Handlers (unchanged) ───
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
    setMobileSidebarOpen(false);
  };

  const handleSubModuleSelect = (domainId, subModuleId) => {
    setActiveDomain(domainId);
    setActiveSubModule(subModuleId);
    setExpandedDomains((prev) => ({ ...prev, [domainId]: true }));
    syncAdminLocation(domainId, subModuleId);
    scrollContentToTop();
    setMobileSidebarOpen(false);
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

  const handleCommandNavigate = ({ domainId, subModuleId, entityType, entityId }) => {
    if (!domainId) return;
    const domain = ALL_DOMAINS.find((d) => d.id === domainId);
    const nextSub = subModuleId
      || domain?.subModules?.[0]?.id
      || activeSubModule;
    const type = String(entityType || '').toLowerCase();
    const focusTypes = new Set([
      'user', 'users',
      'bet', 'bets',
      'ticket', 'tickets',
      'transaction', 'transactions',
      'withdrawal', 'withdrawals',
      'kyc_case', 'kyc_cases',
    ]);
    flushSync(() => {
      setActiveDomain(domainId);
      setExpandedDomains((prev) => ({ ...prev, [domainId]: true }));
      setActiveSubModule(nextSub);
      setIsAlertsOpen(false);
      if (entityId && focusTypes.has(type)) {
        setFocusNav({ entityType: type, entityId: String(entityId) });
      } else {
        setFocusNav(null);
      }
    });
    syncAdminLocation(domainId, nextSub);
    scrollContentToTop();
  };

  const openAlertsMenu = () => {
    const rect = alertsBellRef.current?.getBoundingClientRect();
    if (rect) {
      setAlertsMenuPos({
        top: Math.round(rect.bottom + 8),
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

  // Close alerts popover on outside click / Escape
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

  // ─── Loading State ───
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
          background: 'var(--admin-bg)',
          color: 'var(--admin-text)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
          gap: '14px',
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        >
          <BrandLogo size={48} />
        </motion.div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '0.5px' }}>ODDSYRA ADMIN</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', marginTop: '4px' }}>
            Verifying security session…
          </div>
        </div>
      </div>
    );
  }

  // ─── Login Screen ───
  if (!sessionReady) {
    return (
      <AdminLogin
        isDark={isDark}
        sessionError={sessionError}
        signingIn={signingIn}
        adminEmail={adminEmail}
        setAdminEmail={setAdminEmail}
        adminPassword={adminPassword}
        setAdminPassword={setAdminPassword}
        adminTotp={adminTotp}
        setAdminTotp={setAdminTotp}
        mfaStep={mfaStep}
        mfaSecret={mfaSecret}
        mfaOtpauth={mfaOtpauth}
        onSubmit={handleAdminSignIn}
        onResetMfa={() => {
          setMfaStep('password');
          setAdminTotp('');
          setMfaToken('');
          setMfaSecret('');
          setMfaOtpauth('');
          setSessionError('');
        }}
      />
    );
  }

  // ─── Domain View Router ───
  const renderActiveDomainView = () => {
    switch (activeDomain) {
      case 'control-tower': return (
        <ControlTowerView
          subModule={activeSubModule}
          onSubModuleChange={(id) => handleSubModuleSelect('control-tower', id)}
          onNavigate={handleCommandNavigate}
        />
      );
      case 'customers': return (
        <CustomersDomainView
          subModule={activeSubModule}
          focusEntityId={focusNav?.entityId || null}
          focusEntityType={focusNav?.entityType || null}
          onFocusConsumed={() => setFocusNav(null)}
          onNavigate={handleCommandNavigate}
        />
      );
      case 'sports': return <SportsDomainView subModule={activeSubModule} />;
      case 'trading-risk': return <TradingRiskDomainView subModule={activeSubModule} />;
      case 'betting': return (
        <BettingDomainView
          subModule={activeSubModule}
          focusEntityId={focusNav?.entityId || null}
          focusEntityType={focusNav?.entityType || null}
          onFocusConsumed={() => setFocusNav(null)}
        />
      );
      case 'finance': return (
        <FinanceDomainView
          subModule={activeSubModule}
          focusEntityId={focusNav?.entityId || null}
          focusEntityType={focusNav?.entityType || null}
          onFocusConsumed={() => setFocusNav(null)}
        />
      );
      case 'support': return (
        <SupportDomainView
          subModule={activeSubModule}
          focusEntityId={focusNav?.entityId || null}
          focusEntityType={focusNav?.entityType || null}
          onFocusConsumed={() => setFocusNav(null)}
        />
      );
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
  const currentSubObj = currentDomainObj?.subModules?.find((s) => s.id === activeSubModule);

  // ─── Main Authenticated Layout ───
  return (
    <div className={`admin-shell ${isDark ? 'admin-shell--dark' : 'admin-shell--light'}`} style={{ color: 'var(--admin-text)', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif' }}>

      {/* Sidebar */}
      <AdminSidebar
        domainGroups={DOMAIN_GROUPS}
        activeDomain={activeDomain}
        activeSubModule={activeSubModule}
        expandedDomains={expandedDomains}
        onDomainSelect={handleDomainSelect}
        onSubModuleSelect={handleSubModuleSelect}
        onToggleExpand={toggleDomainExpand}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
        isMobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Column */}
      <div className="admin-shell__column">

        {/* Topbar */}
        <AdminTopbar
          globalSearch={globalSearch}
          onSearchChange={(e) => {
            const next = e.target.value;
            setGlobalSearch(next);
            if (next.trim().length >= 2) openCommandPalette(next.trim());
          }}
          onSearchKeyDown={handleGlobalSearchKeyDown}
          onSearchClick={() => openCommandPalette(globalSearch)}
          activeRole={activeRole}
          onRoleChange={handleRoleChange}
          liveAlerts={liveAlerts}
          alertsBellRef={alertsBellRef}
          onToggleAlerts={() => {
            if (isAlertsOpen) setIsAlertsOpen(false);
            else openAlertsMenu();
          }}
          isAlertsOpen={isAlertsOpen}
          onLogout={handleAdminLogout}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          currentDomainLabel={currentDomainObj?.label}
          currentSubLabel={currentSubObj?.label}
        />

        {/* Alerts Popover (portal) */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isAlertsOpen && (
              <motion.div
                ref={alertsMenuRef}
                role="dialog"
                aria-label="Operational Alerts"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.96 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  top: alertsMenuPos.top,
                  right: alertsMenuPos.right,
                  width: '340px',
                  maxWidth: 'calc(100vw - 24px)',
                  background: 'var(--admin-panel)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid var(--admin-border-bright)',
                  borderRadius: 'var(--admin-radius-lg)',
                  boxShadow: 'var(--admin-shadow-lg)',
                  padding: '14px',
                  zIndex: 100000,
                  color: 'var(--admin-text)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid var(--admin-border)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: liveAlerts.length ? '#f43f5e' : '#10b981' }} />
                    <span style={{ fontSize: '0.84rem', fontWeight: 800 }}>Operational Alerts</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      adminApiClient.post('/notifications/v2/notifications/read-all').catch(() => {});
                      setLiveAlerts([]);
                    }}
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                    style={{ color: '#818cf8' }}
                  >
                    Clear All
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                  {liveAlerts.length > 0 ? (
                    liveAlerts.map((alert) => (
                      <button
                        key={alert.id}
                        type="button"
                        onClick={(e) => handleAlertClick(e, alert)}
                        className="admin-card"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          color: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                          <span className={`admin-badge admin-badge--${alert.type === 'CRITICAL' ? 'danger' : alert.type === 'HIGH' ? 'warning' : 'info'}`}>
                            <span className="admin-badge--dot" style={{
                              background: alert.type === 'CRITICAL' ? '#f43f5e' : alert.type === 'HIGH' ? '#fbbf24' : '#818cf8',
                            }} />
                            {alert.type}
                          </span>
                          <span style={{ fontSize: '0.66rem', color: 'var(--admin-text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                            {alert.category || 'ops'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--admin-text)' }}>{alert.title}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', marginTop: '2px', lineHeight: 1.35 }}>{alert.desc}</div>
                        <div style={{ fontSize: '0.7rem', color: '#818cf8', marginTop: '6px', fontWeight: 700 }}>
                          Go to {alert.category || 'section'} →
                        </div>
                      </button>
                    ))
                  ) : (
                    <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '0.8rem' }}>
                      ✓ No active operational alerts
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

        {/* Domain View Content */}
        <main ref={contentScrollRef} className="admin-shell__main">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeDomain}-${activeSubModule}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onAnimationComplete={scrollContentToTop}
            >
              <AdminRBACGate requiredRole={currentDomainObj?.role} domainId={activeDomain}>
                {renderActiveDomainView()}
              </AdminRBACGate>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Status Bar */}
        <AdminStatusBar />
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
