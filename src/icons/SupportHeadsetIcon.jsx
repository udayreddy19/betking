/**
 * Modern Headset mark for support chat (Floating FAB, profile, admin)
 * Matches crisp rounded headphone aesthetic with microphone
 */
export default function SupportHeadsetIcon({ className = '', size = 26, color = 'currentColor', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Headband */}
      <path d="M3.5 13.5v-2a8.5 8.5 0 0 1 17 0v2" />
      {/* Left Earcup */}
      <rect x="2.5" y="12" width="3" height="6.5" rx="1.5" fill="none" strokeWidth="2.2" />
      {/* Right Earcup */}
      <rect x="18.5" y="12" width="3" height="6.5" rx="1.5" fill="none" strokeWidth="2.2" />
      {/* Microphone Boom */}
      <path d="M5.5 17.5v1a3 3 0 0 0 3 3h2" />
      {/* Mic Tip Dot */}
      <circle cx="11.5" cy="21.5" r="1" fill={color} stroke="none" />
    </svg>
  );
}
