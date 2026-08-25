/** Headset mark for support (FAB, profile, admin). */
export default function SupportHeadsetIcon({ className = '', size = 22, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13a2.5 2.5 0 0 0 0 5h1v-5H4z" />
      <path d="M20 13a2.5 2.5 0 0 1 0 5h-1v-5h1z" />
      <path d="M19 18v1a3 3 0 0 1-3 3h-2" />
      <circle cx="12" cy="20" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
