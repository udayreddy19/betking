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
} from '../icons/itshover/index.js';

import {
  SwordsIcon,
  GlobeIcon as AnimateGlobeIcon,
  ActivityIcon,
  ZapIcon,
  UsersIcon,
  GamepadIcon as AnimateGamepadIcon,
  RocketIcon as AnimateRocketIcon,
  LayersIcon,
  FlameIcon as AnimateFlameIcon,
  StarIcon,
} from '@animateicons/react/lucide';

const ITSHOVER_SPORT_MAP = {
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

const ITSHOVER_LEAGUE_MAP = {
  flame: FlameIcon,
  globe: GlobeIcon,
  world: WorldIcon,
  trophy: TrophyIcon,
  cricket: TrophyIcon,
  soccer: GlobeIcon,
};

const ANIMATE_FALLBACK_MAP = {
  cricket: SwordsIcon,
  soccer: AnimateGlobeIcon,
  basketball: ActivityIcon,
  tennis: ZapIcon,
  'table-tennis': ZapIcon,
  kabaddi: UsersIcon,
  esoccer: AnimateGamepadIcon,
  'virtual-cricket': AnimateRocketIcon,
  volleyball: LayersIcon,
  'american-football': AnimateFlameIcon,
};

const ANIMATE_LEAGUE_FALLBACK = {
  flame: AnimateFlameIcon,
  globe: AnimateGlobeIcon,
  world: AnimateGlobeIcon,
  trophy: StarIcon,
  cricket: SwordsIcon,
  soccer: AnimateGlobeIcon,
};

function resolveIcon(map, fallbackMap, key, defaultIcon) {
  if (key && map[key]) return map[key];
  if (key && fallbackMap[key]) return fallbackMap[key];
  return defaultIcon;
}

export function getSportIcon(sport) {
  return resolveIcon(ITSHOVER_SPORT_MAP, ANIMATE_FALLBACK_MAP, sport, TrophyIcon);
}

export function getLeagueIcon(iconKey, sport) {
  if (iconKey) {
    const icon = resolveIcon(ITSHOVER_LEAGUE_MAP, ANIMATE_LEAGUE_FALLBACK, iconKey, null);
    if (icon) return icon;
  }
  if (sport) return getSportIcon(sport);
  return TrophyIcon;
}
