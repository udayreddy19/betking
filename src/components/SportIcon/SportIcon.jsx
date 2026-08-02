import {
  TrophyIcon,
  GlobeIcon,
  GaugeIcon,
  TargetIcon,
  UsersGroupIcon,
  GamepadIcon,
  RocketIcon,
  Stack3Icon,
  FlameIcon,
  WorldIcon,
} from '../../icons/itshover/index.js';

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
  return <Icon className={className} color={color} size={size} />;
}
