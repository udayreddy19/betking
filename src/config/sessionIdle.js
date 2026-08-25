/** Log out signed-in users after this many ms with no interaction. */
export const SESSION_IDLE_LOGOUT_MS =
  Number(import.meta.env.VITE_SESSION_IDLE_LOGOUT_MS) || 30 * 60 * 1000;
