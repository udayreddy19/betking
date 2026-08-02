import './ui.css';

export default function PageHeader({
  title,
  subtitle,
  action,
  className = '',
}) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="ui-page-header__title">{title}</h1>
          {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
