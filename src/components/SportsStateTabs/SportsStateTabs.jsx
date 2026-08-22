import './SportsStateTabs.css';

function LiveTabIcon({ active }) {
  return (
    <span className={`sports-state-tabs__icon ${active ? 'is-live' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path
          d="M8.5 12c0-2.5 1.5-4 3.5-4s3.5 1.5 3.5 4-1.5 4-3.5 4"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M12 8v8M9.5 9.5c1.2-.8 2.8-.8 4 0M9.5 14.5c1.2.8 2.8.8 4 0"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function PreLiveTabIcon({ active }) {
  return (
    <span className={`sports-state-tabs__icon ${active ? 'is-prelive-active' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M12 15V9M9 11.5L12 9l3 2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function UpcomingTabIcon({ active }) {
  return (
    <span className={`sports-state-tabs__icon ${active ? 'is-upcoming-active' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <circle cx="12" cy="12" r="4.25" stroke="#fff" strokeWidth="1.6" />
        <path d="M12 8.2V12l2.4 1.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const TABS = [
  { id: 'live', label: 'Live', Icon: LiveTabIcon },
  { id: 'prelive', label: 'Pre-live', Icon: PreLiveTabIcon },
  { id: 'upcoming', label: 'Upcoming', Icon: UpcomingTabIcon },
];

export default function SportsStateTabs({ activeId, onSelect, counts = {} }) {
  return (
    <div className="sports-state-tabs" role="tablist" aria-label="Match timing">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeId === id;
        const count = counts[id] ?? 0;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`sports-state-tabs__tab${active ? ' is-active' : ''}`}
            onClick={() => onSelect(id)}
          >
            <Icon active={active} />
            <span className="sports-state-tabs__label">
              {label}
              {count > 0 && <span className="sports-state-tabs__count">{count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
