import React, { createContext, useContext, useMemo } from 'react';

const EMPTY = { domains: {}, subModules: {}, updatedAt: null };

const AdminNavAttentionContext = createContext(EMPTY);

export function AdminNavAttentionProvider({ value, children }) {
  const memo = useMemo(() => ({
    domains: value?.domains || {},
    subModules: value?.subModules || {},
    updatedAt: value?.updatedAt || null,
  }), [value?.domains, value?.subModules, value?.updatedAt]);

  return (
    <AdminNavAttentionContext.Provider value={memo}>
      {children}
    </AdminNavAttentionContext.Provider>
  );
}

export function useAdminNavAttention() {
  return useContext(AdminNavAttentionContext);
}

/** @returns {number|undefined} count when > 0, else undefined (hides tab badge) */
export function useNavAttentionCount(domainId, subModuleId) {
  const attention = useAdminNavAttention();
  const n = Number(attention?.subModules?.[`${domainId}:${subModuleId}`]?.count || 0);
  return n > 0 ? n : undefined;
}
