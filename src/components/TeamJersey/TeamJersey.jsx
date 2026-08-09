import { useMemo } from 'react';
import jerseyImg from '../../assets/cricket-jersey.png';
import { getJerseyImageFilter } from '../../utils/jerseyColors';
import './TeamJersey.css';

/** Approved 3D jersey mockup image — recolored per team via CSS filter with flying animation. */
export default function TeamJersey({ team, size = 52, className = '', isFlying = false, isBatting = false }) {
  const filter = useMemo(
    () => getJerseyImageFilter(team),
    [team],
  );
  const height = Math.round(size * 1.22);
  const shouldFly = isFlying || isBatting;

  return (
    <div
      className={`team-jersey-kit ${shouldFly ? 'team-jersey-kit--flying' : ''} ${className}`.trim()}
      style={{ width: size, height }}
      aria-hidden="true"
      title={typeof team === 'string' ? team : (team?.name || undefined)}
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
