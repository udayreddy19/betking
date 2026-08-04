import { useMemo } from 'react';
import { getSportIcon, getLeagueIcon } from '../../utils/sportIcons.js';
import { withItshoverIcon } from '../../icons/itshoverIcon.jsx';

export default function SportIcon({ sport, icon, className = '', color, size = 20 }) {
  const IconComponent = icon ? getLeagueIcon(icon, sport) : getSportIcon(sport);
  const WrappedIcon = useMemo(() => withItshoverIcon(IconComponent), [IconComponent]);

  return (
    <WrappedIcon
      className={className}
      color={color}
      size={size}
      aria-hidden
    />
  );
}
