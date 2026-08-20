/**
 * Public auth facade. Implementation lives in src/context/auth/*.
 * UI should keep importing useAuth from this file.
 */
export { AuthProvider } from './auth/AuthProvider';
export { useAuth } from './auth/authContext';
export { useSession, useWallet, useLoyalty, useResponsibleGaming } from './auth/authHooks';
