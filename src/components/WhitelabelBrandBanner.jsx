import React from 'react';

/**
 * Whitelabel Tenant Brand Context Banner Component
 * Renders tenant identity badge (MAIN_SPORTSBOOK or White-Label Tenant Name) in Admin Control Center.
 */
export default function WhitelabelBrandBanner({ tenant = {} }) {
  const brandName = tenant.displayName || tenant.name || 'BetKing Sportsbook';
  const slug = tenant.slug || 'betking';
  const isDefault = tenant.id === 'tenant_default' || slug === 'betking';
  const badgeText = isDefault ? 'MAIN_SPORTSBOOK' : `WHITELABEL (${slug.toUpperCase()})`;

  return (
    <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-bold text-slate-200">{brandName}</span>
      </div>

      <span className="px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        {badgeText}
      </span>
    </div>
  );
}
