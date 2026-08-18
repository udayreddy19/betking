export default function BrandLogo({ size = 40, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="16" fill="#14181F" />
      <circle cx="32" cy="32" r="20" stroke="#1F8A4C" strokeWidth="3.2" />
      <path d="M32 12a20 20 0 0 1 14.14 5.86" stroke="#7DFF6B" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M46.14 46.14A20 20 0 0 1 32 52" stroke="#E8A317" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="32" cy="32" r="11" fill="#C4452D" />
      <path d="M32 21.5c3.2 3.4 3.2 7.6 0 10.5-3.2 2.9-3.2 7.1 0 10.5" stroke="#F6F2EA" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M32 21.5c-3.2 3.4-3.2 7.6 0 10.5 3.2 2.9 3.2 7.1 0 10.5" stroke="#F6F2EA" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function BrandWordmark({ className = '' }) {
  return (
    <span className={`brand-wordmark ${className}`.trim()}>
      <span className="brand-wordmark-odds">ODDS</span>
      <span className="brand-wordmark-yra">YRA</span>
    </span>
  );
}
