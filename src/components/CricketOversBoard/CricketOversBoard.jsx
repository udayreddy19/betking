import { useMemo, useState } from 'react';
import {
  buildOversBoardRows,
  listOversBoardInnings,
} from '../../utils/liveMatchWidgetData';
import './CricketOversBoard.css';

function ballChipClass(ball) {
  const s = String(ball || '').trim();
  if (/^w$/i.test(s)) return 'cric-overs-chip cric-overs-chip--w';
  if (s === '6') return 'cric-overs-chip cric-overs-chip--6';
  if (s === '4') return 'cric-overs-chip cric-overs-chip--4';
  if (/wd|nb/i.test(s)) return 'cric-overs-chip cric-overs-chip--extra';
  if (s === '.' || s === '•' || s === '0') return 'cric-overs-chip cric-overs-chip--dot';
  return 'cric-overs-chip';
}

function displayBall(ball) {
  const s = String(ball || '').trim();
  if (s === '•' || s === '0') return '.';
  return s || '·';
}

/**
 * Ball-by-ball overs board: Over | Balls | Runs (newest first).
 */
export default function CricketOversBoard({ match, className = '' }) {
  const inningsList = useMemo(() => listOversBoardInnings(match), [match]);
  const [inningsId, setInningsId] = useState(() => inningsList[inningsList.length - 1] || 1);

  const activeInn = inningsList.includes(inningsId)
    ? inningsId
    : (inningsList[inningsList.length - 1] || 1);

  const rows = useMemo(
    () => buildOversBoardRows(match, { inningsId: activeInn }),
    [match, activeInn],
  );

  return (
    <div className={`cric-overs-board ${className}`.trim()}>
      {inningsList.length > 1 && (
        <div className="cric-overs-board__inns" role="tablist" aria-label="Innings">
          {inningsList.map((inn) => (
            <button
              key={inn}
              type="button"
              role="tab"
              aria-selected={activeInn === inn}
              className={`cric-overs-board__inn-tab${activeInn === inn ? ' is-active' : ''}`}
              onClick={() => setInningsId(inn)}
            >
              {inn === 1 ? '1st innings' : inn === 2 ? '2nd innings' : `Innings ${inn}`}
            </button>
          ))}
        </div>
      )}

      <div className="cric-overs-board__head" aria-hidden="true">
        <span>Over</span>
        <span>Balls</span>
        <span>Runs</span>
      </div>

      {!rows.length ? (
        <p className="cric-overs-board__empty">Over-by-over ball history will appear once play starts.</p>
      ) : (
        <ul className="cric-overs-board__list">
          {rows.map((row) => (
            <li
              key={`${row.inningsId || activeInn}-${row.overNum}`}
              className={`cric-overs-board__row${row.isCurrent ? ' is-current' : ''}`}
            >
              <div className="cric-overs-board__over">
                <span className="cric-overs-board__ov-label">Ov {row.overNum}</span>
                {row.scoreAtEnd ? (
                  <span className="cric-overs-board__score">{String(row.scoreAtEnd).replace('/', '-')}</span>
                ) : null}
              </div>
              <div className="cric-overs-board__balls-col">
                {row.commentary ? (
                  <p className="cric-overs-board__caption">{row.commentary}</p>
                ) : null}
                <div className="cric-overs-board__chips" aria-label={`Over ${row.overNum} balls`}>
                  {(row.balls || []).map((ball, idx) => (
                    <span key={`${row.overNum}-${idx}`} className={ballChipClass(ball)}>
                      {displayBall(ball)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="cric-overs-board__runs" title="Runs in over">
                {row.overRuns}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
