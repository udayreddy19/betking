import React, { createContext, useContext } from 'react';

const AdminNavAttentionContext = createContext({
  domains: {},
  subModules: {},
});

export function AdminNavAttentionProvider({ value, children }) {
  return (
    <AdminNavAttentionContext.Provider value={value || { domains: {}, subModules: {} }}>
      {children}
    </AdminNavAttentionContext.Provider>
  );
}

export function useAdminNavAttention() {
  return useContext(AdminNavAttentionContext);
}

/** Resolve a tab count from domain:subModule attention keys. */
export function attentionCountFor(attention, domainId, subModuleId) {
  if (!attention) return undefined;
  const n = Number(attention.subModules?.[`${domainId}:${subModuleId}`]?.count || 0);
  return n > 0 ? n : undefined;
}
