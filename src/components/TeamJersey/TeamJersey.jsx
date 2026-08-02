import { useMemo } from 'react';
import jerseyImg from '../../assets/cricket-jersey.png';
import { getJerseyImageFilter } from '../../utils/jerseyColors';
import './TeamJersey.css';

/** Approved 3D jersey mockup — recolored per team via CSS filter. */
export default function TeamJersey({ team, size = 52, className = '' }) {
  const filter = useMemo(
    () => getJerseyImageFilter(team),
    [team?.color, team?.accentColor, team?.name, team?.shortName],
  );
  const height = Math.round(size * 1.22);

  return (
    <div
      className={`team-jersey-kit ${className}`.trim()}
      style={{ width: size, height }}
      aria-hidden="true"
      title={team?.name || undefined}
    >
      <img
        src={jerseyImg}
        alt=""
        className="team-jersey-kit__img"
        style={{ width: size, height, filter }}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
