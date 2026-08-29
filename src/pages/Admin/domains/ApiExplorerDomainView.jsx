import React from 'react';
import ApiExplorerPage from '../features/ApiExplorer/ApiExplorerPage';

export default function ApiExplorerDomainView({ subModule = 'overview' }) {
  return <ApiExplorerPage subModule={subModule} />;
}
