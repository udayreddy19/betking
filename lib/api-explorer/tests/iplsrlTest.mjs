import { getIPLSRLControlSnapshot } from '../../iplSrlAdminControl.mjs';
import { normalizeTestResult, mapThrownError } from '../result.mjs';
import { timed } from '../timeout.mjs';

export async function testIplsrl() {
  const started = Date.now();
  try {
    const { value, responseTimeMs, error } = await timed(() => Promise.resolve(getIPLSRLControlSnapshot()));
    if (error) return mapThrownError(error, responseTimeMs);
    return normalizeTestResult({
      success: true,
      statusCode: 200,
      responseTimeMs,
      implementation: 'INTERNAL_SIM',
      summary: {
        engine: 'IPLSRL',
        note: 'Internal simulated league. No third-party SRL vendor API.',
        snapshotKeys: value && typeof value === 'object' ? Object.keys(value).slice(0, 12) : [],
      },
      data: {
        engine: 'IPLSRL',
        hasSnapshot: Boolean(value),
      },
    });
  } catch (err) {
    return mapThrownError(err, Date.now() - started);
  }
}
