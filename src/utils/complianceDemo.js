/** Toggle-ON / TEST_USER mode: VEXQORA technology & software business (PG verification shell). */

export const VEXQORA_BUSINESS_DESCRIPTION =
  'VEXQORA is a technology and software development business engaged in designing, developing, operating, and providing digital software solutions, web applications, mobile applications, payment and wallet management solutions, and other technology-enabled services. The business focuses on developing secure, scalable, and user-friendly digital platforms for businesses and consumers, including software development, system integration, application maintenance, technology consulting, and related IT-enabled services. VEXQORA may integrate third-party technology, payment gateways, APIs, and cloud services to facilitate digital transactions and provide technology solutions to its customers. The business operates in compliance with applicable laws, regulations, and payment service provider requirements.';

export const COMPLIANCE_COPY = {
  legalBusinessName: 'Vexqora Technologies Pvt Ltd',
  productName: 'VEXQORA',
  tagline: 'Software engineering · platforms · integrations',
  homeHeadline: 'Build, launch, and run digital products with a dedicated tech partner',
  homeSub:
    'We design and ship web apps, mobile products, and payment-ready platforms for Indian businesses — from first release to ongoing maintenance.',
  businessDescription: VEXQORA_BUSINESS_DESCRIPTION,
  enrollTitle: 'Start a project order',
  enrollSub:
    'Pick a scoped engagement, enter the client contact, and confirm checkout. You will receive an order reference after payment clears.',
  chargeTitle: 'Start a project order',
  chargeSub: 'Pick a scoped engagement and confirm the client order.',
  collectTitle: 'Start a project order',
  collectSub: 'Pick a scoped engagement and confirm the client order.',
  recordsTitle: 'Project order history',
  businessTitle: 'Company profile',
  metaDescription:
    'Vexqora Technologies Pvt Ltd (VEXQORA) — software development, web & mobile apps, payment platforms, API integrations, and IT consulting.',
  supportEmail: 'support@oddsyra.com',
  salesEmail: 'hello@oddsyra.com',
  supportHours: 'Mon–Sat, 10:00–19:00 IST',
  registeredIn: 'India (Private Limited Company)',
  hqNote: 'Serving clients across India remotely and on-site by arrangement',
  gstin: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VEXQORA_GSTIN) || 'GSTIN on request',
  cin: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VEXQORA_CIN) || 'CIN on request',
  registeredAddress:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VEXQORA_ADDRESS)
    || 'Registered office details available on Company page',
};

/**
 * Client-facing packages. amountInr drives gateway checkout only.
 * categoryType / subcategoryId must match deposit catalog rows used in production.
 */
export const COMPLIANCE_PROGRAMS = [
  {
    id: 'sw-platform',
    kind: 'Web',
    title: 'Business website & admin portal',
    detail: 'Discovery workshop, responsive UI, CMS-ready pages, staging + go-live support',
    delivery: '4–6 week delivery',
    billing: 'Project kickoff invoice',
    includes: ['Wireframes + UI build', 'Admin console basics', 'Hosting handoff docs', '30-day bugfix'],
    amountInr: 18500,
    categoryType: 'education',
    subcategoryId: 'new-education',
    subcategoryName: 'New Education',
  },
  {
    id: 'sw-mobile',
    kind: 'Mobile',
    title: 'Customer mobile app (MVP)',
    detail: 'Android-first MVP with auth, core flows, and REST API wiring to your backend',
    delivery: '8–10 week delivery',
    billing: 'Milestone kickoff invoice',
    includes: ['Product scope workshop', 'Core screens + navigation', 'API integration', 'Play Store build support'],
    amountInr: 42000,
    categoryType: 'education',
    subcategoryId: 'pb-c-education',
    subcategoryName: 'PB C EDUCATION',
  },
  {
    id: 'sw-wallet',
    kind: 'Payments',
    title: 'Payment gateway & ledger module',
    detail: 'Checkout flows, webhook handling, reconciliation views, and ops-ready reporting hooks',
    delivery: '3–5 week delivery',
    billing: 'Integration kickoff invoice',
    includes: ['Gateway sandbox setup', 'Webhook + retry design', 'Ops dashboard screens', 'UAT checklist'],
    amountInr: 28990,
    categoryType: 'travel',
    subcategoryId: 'travel-pure',
    subcategoryName: 'Travel Pure',
  },
  {
    id: 'sw-consult',
    kind: 'Support',
    title: 'Cloud ops & engineering retainer',
    detail: 'Monthly capacity for monitoring, patches, small features, and production support',
    delivery: 'Billed monthly',
    billing: 'Monthly retainer invoice',
    includes: ['Up to 40 eng. hours / month', 'Priority incident channel', 'Release checklist reviews', 'Monthly status note'],
    amountInr: 35400,
    categoryType: 'travel',
    subcategoryId: 'pb-c-cruse',
    subcategoryName: 'PB C Cruse',
  },
];

export const COMPLIANCE_CAPABILITIES = [
  'Custom software development',
  'Web & mobile applications',
  'Payment platform integrations',
  'API & cloud systems',
  'Technology consulting',
];

export const COMPLIANCE_HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Choose a scoped package',
    body: 'Each package has a clear delivery window and deliverables — a fixed project fee, not a prepaid balance.',
  },
  {
    step: '2',
    title: 'Confirm the client order',
    body: 'Capture the business contact and complete secure checkout through our payment partner.',
  },
  {
    step: '3',
    title: 'We kick off delivery',
    body: 'You get an order reference; our engineering team schedules kickoff and shares the project checklist.',
  },
];

export function isComplianceDemoUser(user) {
  return Boolean(user?.complianceDemo);
}

export function formatPackagePrice(amountInr) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amountInr) || 0);
}
