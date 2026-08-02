import { TrophyIcon } from '../../icons/itshover/trophy-icon.jsx';
import { GlobeIcon } from '../../icons/itshover/globe-icon.jsx';
import { GaugeIcon } from '../../icons/itshover/gauge-icon.jsx';
import { TargetIcon } from '../../icons/itshover/target-icon.jsx';
import { UsersGroupIcon } from '../../icons/itshover/users-group-icon.jsx';
import { GamepadIcon } from '../../icons/itshover/gamepad-icon.jsx';
import { RocketIcon } from '../../icons/itshover/rocket-icon.jsx';
import { Stack3Icon } from '../../icons/itshover/stack-3-icon.jsx';
import { FlameIcon } from '../../icons/itshover/flame-icon.jsx';
import { WorldIcon } from '../../icons/itshover/world-icon.jsx';

const SPORT_ICON_MAP = {
  cricket: TrophyIcon,
  soccer: GlobeIcon,
  basketball: GaugeIcon,
  tennis: TargetIcon,
  'table-tennis': TargetIcon,
  kabaddi: UsersGroupIcon,
  esoccer: GamepadIcon,
  'virtual-cricket': RocketIcon,
  volleyball: Stack3Icon,
  'american-football': FlameIcon,
};

const LEAGUE_ICON_MAP = {
  flame: FlameIcon,
  globe: GlobeIcon,
  world: WorldIcon,
  trophy: TrophyIcon,
  cricket: TrophyIcon,
  soccer: GlobeIcon,
};

export function getSportIcon(sport) {
  return SPORT_ICON_MAP[sport] || TrophyIcon;
}

export function getLeagueIcon(iconKey, sport) {
  if (iconKey && LEAGUE_ICON_MAP[iconKey]) return LEAGUE_ICON_MAP[iconKey];
  if (sport) return getSportIcon(sport);
  return TrophyIcon;
}

export default function SportIcon({ sport, icon, className = '', color, size }) {
  const Icon = icon ? getLeagueIcon(icon, sport) : getSportIcon(sport);
  return <Icon className={className} color={color} size={size} aria-hidden />;
}
