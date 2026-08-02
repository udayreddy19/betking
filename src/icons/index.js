/**
 * Hybrid icon system for BetKing:
 *
 * @animateicons/react (./animate/) — primary UI icons: navigation, forms, modals,
 *   header, sidebar, toasts, bet slip, chevrons, search, menu, user, wallet, settings, etc.
 *
 * itshover (./itshover/) — sport/league icons and specialty animated icons where
 *   animateicons lacks good matches: trophy, globe, flame, rocket, target, gamepad, bell, etc.
 */

// ── @animateicons/react — UI chrome ──────────────────────────────────────────
export * from './animate/index.js';

// ── itshover — sport & specialty icons ───────────────────────────────────────
export {
  TrophyIcon,
  GlobeIcon,
  WorldIcon,
  TargetIcon,
  GamepadIcon,
  FlameIcon,
  RocketIcon,
  GaugeIcon,
  Stack3Icon,
  UsersGroupIcon,
  FilledBellIcon,
  ChartBarIcon as ItshoverChartBarIcon,
  UsersIcon as ItshoverUsersIcon,
} from './itshover/index.js';

import {
  TrophyIcon,
  FilledBellIcon,
} from './itshover/index.js';
import { withItshoverIcon } from './itshoverIcon.jsx';

// Specialty itshover aliases for UI spots with weaker animateicons equivalents
export const HiOutlineTrophy = withItshoverIcon(TrophyIcon);
export const IoNotifications = withItshoverIcon(FilledBellIcon);
