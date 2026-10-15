import { useProducts } from '../context/ProductContext';
import { COMPLIANCE_COPY } from '../utils/complianceDemo';

/**
 * PG compliance / Fee Desk mode for OddsYra.
 * Active when Admin product config has pgReviewMode ON (not BrandingContext).
 */
export function useComplianceDemo() {
  const { pgReviewMode, ready } = useProducts();
  const active = pgReviewMode === true;
  return {
    active,
    ready: Boolean(ready),
    copy: COMPLIANCE_COPY,
  };
}
