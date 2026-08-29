import React from 'react';
import AdminTabs from '../../components/AdminTabs';

export default function ApiCategoryTabs({ categories = [], counts = {}, active, onChange }) {
  const tabs = [
    { id: 'ALL', label: 'All', count: counts.ALL },
    ...categories.map((c) => ({
      id: c.id,
      label: c.label,
      count: counts[c.id],
    })),
  ];
  return <AdminTabs tabs={tabs} active={active} onChange={onChange} />;
}
