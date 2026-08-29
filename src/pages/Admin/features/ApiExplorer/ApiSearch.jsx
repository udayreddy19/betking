import React from 'react';
import AdminFilterBar, { FilterSearch, FilterSelect } from '../../components/AdminFilterBar';

export default function ApiSearch({
  query,
  onQuery,
  statusFilter,
  onStatus,
  typeFilter,
  onType,
}) {
  return (
    <AdminFilterBar label="Filter">
      <FilterSearch
        value={query}
        onChange={onQuery}
        placeholder="Search APIs, providers, endpoints…"
      />
      <FilterSelect
        value={statusFilter}
        onChange={onStatus}
        options={[
          { value: 'ALL', label: 'Any status' },
          { value: 'HEALTHY', label: 'Healthy' },
          { value: 'SLOW', label: 'Slow' },
          { value: 'FAILED', label: 'Failed' },
          { value: 'NOT_CONFIGURED', label: 'Not configured' },
        ]}
      />
      <FilterSelect
        value={typeFilter}
        onChange={onType}
        options={[
          { value: 'ALL', label: 'Internal + external' },
          { value: 'INTERNAL', label: 'Internal' },
          { value: 'EXTERNAL', label: 'External' },
        ]}
      />
    </AdminFilterBar>
  );
}
