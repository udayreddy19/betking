/**
 * Authentic SVG Brand Payment Logos for BetKing
 */

export function UpiLogo({ height = 28, className = '' }) {
  return (
    <svg height={height} viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ borderRadius: '6px', overflow: 'hidden' }}>
      <rect width="100" height="32" rx="6" fill="#059669" />
      <g transform="translate(10, 6)">
        {/* Double chevrons */}
        <path d="M12 4L18 16H14.5L12 11L9.5 16H6L12 4Z" fill="#FFFFFF" />
        <path d="M16 4L22 16H18.5L16 11L13.5 16H10L16 4Z" fill="#F97316" />
        {/* Brand Text */}
        <text x="26" y="15" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="13" letterSpacing="0.8">UPI</text>
      </g>
    </svg>
  );
}

export function GPayLogo({ height = 28, className = '' }) {
  return (
    <svg height={height} viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ borderRadius: '6px', overflow: 'hidden' }}>
      <rect width="100" height="32" rx="6" fill="#1E293B" />
      <g transform="translate(12, 6)">
        {/* Multi-color Google G */}
        <path d="M9.5 10.2c0-.5 0-1-.1-1.5H5v3h2.6c-.1.7-.5 1.4-1.1 1.8v1.5h1.8c1.1-1 1.7-2.6 1.7-4.8z" fill="#4285F4"/>
        <path d="M5 14.8c2.6 0 4.8-.9 6.4-2.4l-1.8-1.5c-.5.4-1.2.7-2.1.7-1.6 0-3-1.1-3.5-2.6H2.1v1.6c1.5 2.6 4.3 4.2 7.4 4.2z" fill="#34A853"/>
        <path d="M1.5 9c-.1-.5-.1-1 0-1.5V5.9H2.1c-.9 1.7-.9 3.8 0 5.5l1.8-1.5c-.3-.3-.4-.6-.4-.9z" fill="#FBBC05"/>
        <path d="M5 3.2c1.4 0 2.7.5 3.7 1.4l1.4-1.4C8.7 1.9 6.9 1.2 5 1.2 1.9 1.2-.9 2.8-2.4 5.4l1.8 1.5c.5-1.5 1.9-2.7 3.5-2.7z" transform="translate(2.5, 2)" fill="#EA4335"/>
        {/* Pay Text */}
        <text x="18" y="15" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="13">Pay</text>
      </g>
    </svg>
  );
}

export function PhonePeLogo({ height = 28, className = '' }) {
  return (
    <svg height={height} viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ borderRadius: '6px', overflow: 'hidden' }}>
      <rect width="100" height="32" rx="6" fill="#5F259F" />
      <g transform="translate(8, 6)">
        {/* Circle with P symbol */}
        <circle cx="10" cy="10" r="8" fill="#FFFFFF" />
        <path d="M8 6H11.5C12.9 6 14 7.1 14 8.5C14 9.9 12.9 11 11.5 11H9.5V14H8V6ZM9.5 9.5H11.5C12.1 9.5 12.5 9.1 12.5 8.5C12.5 7.9 12.1 7.5 11.5 7.5H9.5V9.5Z" fill="#5F259F" />
        {/* Text */}
        <text x="23" y="15" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="12" letterSpacing="0.3">PhonePe</text>
      </g>
    </svg>
  );
}

export function PaytmLogo({ height = 28, className = '' }) {
  return (
    <svg height={height} viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ borderRadius: '6px', overflow: 'hidden' }}>
      <rect width="100" height="32" rx="6" fill="#002E6E" />
      <g transform="translate(10, 6)">
        <text x="4" y="15" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="14">pay</text>
        <text x="32" y="15" fill="#00BAF2" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="14">tm</text>
      </g>
    </svg>
  );
}

export function BhimLogo({ height = 28, className = '' }) {
  return (
    <svg height={height} viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ borderRadius: '6px', overflow: 'hidden' }}>
      <rect width="100" height="32" rx="6" fill="#0F172A" />
      <g transform="translate(10, 6)">
        <path d="M4 3L13 10L4 17V3Z" fill="#059669" />
        <path d="M10 3L19 10L10 17V3Z" fill="#F97316" />
        <text x="25" y="15" fill="#FFFFFF" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="900" fontSize="13">BHIM</text>
      </g>
    </svg>
  );
}
