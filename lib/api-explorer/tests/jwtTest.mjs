import { signHs256, verifyHs256 } from '../../jwtHs256.mjs';
import { getJwtSecret } from '../../jwtSecret.mjs';
import { normalizeTestResult, failResult, mapThrownError } from '../result.mjs';
import { ERROR_CODES } from '../errorCodes.mjs';
import { envPresent } from '../configStatus.mjs';
import { timed } from '../timeout.mjs';

export async function testJwt() {
  const envConfigured = envPresent('JWT_SECRET');
  if (!envConfigured && process.env.NODE_ENV === 'production') {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'JWT_SECRET is not configured',
      extra: { healthStatus: 'NOT_CONFIGURED', summary: { configured: false } },
    });
  }
  try {
    getJwtSecret();
  } catch {
    return failResult({
      code: ERROR_CODES.NOT_CONFIGURED,
      message: 'JWT_SECRET is not configured',
      extra: { healthStatus: 'NOT_CONFIGURED', summary: { configured: false } },
    });
  }
  try {
    const { value, responseTimeMs, error } = await timed(() => {
      const token = signHs256({ sub: 'api-explorer-self-test', type: 'api_explorer_probe' }, '30s');
      const decoded = verifyHs256(token);
      if (!decoded || decoded.sub !== 'api-explorer-self-test') {
        throw new Error('JWT round-trip failed');
      }
      return true;
    });
    if (error) return mapThrownError(error, responseTimeMs);
    return normalizeTestResult({
      success: Boolean(value),
      statusCode: 200,
      responseTimeMs,
      summary: {
        configured: true,
        envVarPresent: envConfigured,
        usingDevelopmentDefault: !envConfigured,
        roundTrip: true,
        tokenReturned: false,
        note: 'Signed and verified an internal probe claim. Token is not returned.',
      },
      data: { configured: true, roundTrip: true, envVarPresent: envConfigured },
    });
  } catch (err) {
    return mapThrownError(err, 0);
  }
}
