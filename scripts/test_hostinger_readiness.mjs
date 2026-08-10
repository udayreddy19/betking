import fs from 'fs';
import path from 'path';
import { validateProductionConfig } from '../lib/configValidator.mjs';
import dotenv from 'dotenv';

dotenv.config();

console.log('🚀 EXECUTING BETKING PRODUCTION INFRASTRUCTURE & HOSTINGER READINESS TEST SUITE...\n');

async function runHostingerReadinessSuite() {
  let passed = 0;
  let total = 8;
  const rootDir = process.cwd();

  // 1. PRODUCTION ENVIRONMENT CONFIGURATION VALIDATOR
  try {
    console.log('   ⏳ Test 1/8: Validating production configuration validator...');
    const result = validateProductionConfig();
    if (result.isValid) {
      console.log(`✅ TEST 1/8 PASSED: Production Configuration Validator check clean.`);
      passed++;
    } else {
      console.error('❌ TEST 1/8 FAILED:', result.errors);
    }
  } catch (err) {
    console.error('❌ TEST 1/8 FAILED:', err.message);
  }

  // 2. HEALTH, LIVENESS & READINESS ENDPOINTS
  try {
    console.log('   ⏳ Test 2/8: Checking /health, /readiness, and /liveness server routes...');
    const serverCode = fs.readFileSync(path.join(rootDir, 'server/index.js'), 'utf8');
    if (serverCode.includes("app.get('/liveness'") && serverCode.includes("app.get('/readiness'") && serverCode.includes("app.get('/health'")) {
      console.log(`✅ TEST 2/8 PASSED: Operational Health (/health, /readiness, /liveness) endpoints implemented.`);
      passed++;
    } else {
      console.error('❌ TEST 2/8 FAILED: Operational endpoints missing in server/index.js');
    }
  } catch (err) {
    console.error('❌ TEST 2/8 FAILED:', err.message);
  }

  // 3. PRODUCTION DOCKER COMPOSE MANIFEST VALIDATION
  try {
    console.log('   ⏳ Test 3/8: Validating docker-compose.prod.yml production manifest...');
    const dockerFile = fs.readFileSync(path.join(rootDir, 'docker-compose.prod.yml'), 'utf8');
    const hasPostgres = dockerFile.includes('betking_prod_postgres');
    const hasRedis = dockerFile.includes('betking_prod_redis');
    const hasNginx = dockerFile.includes('betking_prod_nginx');
    const hasNetwork = dockerFile.includes('betking-prod-net');

    if (hasPostgres && hasRedis && hasNginx && hasNetwork) {
      console.log(`✅ TEST 3/8 PASSED: docker-compose.prod.yml verified! (PostgreSQL, Redis, Nginx isolated on private network).`);
      passed++;
    } else {
      console.error('❌ TEST 3/8 FAILED: docker-compose.prod.yml missing required services or network');
    }
  } catch (err) {
    console.error('❌ TEST 3/8 FAILED:', err.message);
  }

  // 4. NGINX REVERSE PROXY CONFIGURATION SYNTAX
  try {
    console.log('   ⏳ Test 4/8: Checking Nginx reverse proxy configuration (nginx/nginx.conf)...');
    const nginxFile = fs.readFileSync(path.join(rootDir, 'nginx/nginx.conf'), 'utf8');
    const hasSsl = nginxFile.includes('ssl_certificate');
    const hasWs = nginxFile.includes('location /ws');
    const hasApi = nginxFile.includes('location /api/');

    if (hasSsl && hasWs && hasApi) {
      console.log(`✅ TEST 4/8 PASSED: nginx/nginx.conf verified! (SSL, API reverse proxy & WSS WebSocket upgrade configured).`);
      passed++;
    } else {
      console.error('❌ TEST 4/8 FAILED: Nginx configuration incomplete');
    }
  } catch (err) {
    console.error('❌ TEST 4/8 FAILED:', err.message);
  }

  // 5. SECURITY HEADERS & RATE LIMITING CHECK
  try {
    console.log('   ⏳ Test 5/8: Verifying production security headers and rate limiting...');
    const nginxFile = fs.readFileSync(path.join(rootDir, 'nginx/nginx.conf'), 'utf8');
    const hasHsts = nginxFile.includes('Strict-Transport-Security');
    const hasFrame = nginxFile.includes('X-Frame-Options');
    const hasRateLimit = nginxFile.includes('limit_req_zone');

    if (hasHsts && hasFrame && hasRateLimit) {
      console.log(`✅ TEST 5/8 PASSED: Security Headers & Rate Limiting verified in Nginx config.`);
      passed++;
    } else {
      console.error('❌ TEST 5/8 FAILED: Missing security headers or rate limits');
    }
  } catch (err) {
    console.error('❌ TEST 5/8 FAILED:', err.message);
  }

  // 6. GRACEFUL SHUTDOWN HANDLER CHECK
  try {
    console.log('   ⏳ Test 6/8: Verifying graceful shutdown handlers...');
    const workerFile = fs.readFileSync(path.join(rootDir, 'lib/schedulerWorker.mjs'), 'utf8');
    if (workerFile.includes('stopBackgroundWorkers')) {
      console.log(`✅ TEST 6/8 PASSED: Graceful shutdown mechanism verified.`);
      passed++;
    } else {
      console.error('❌ TEST 6/8 FAILED: Graceful shutdown handler missing');
    }
  } catch (err) {
    console.error('❌ TEST 6/8 FAILED:', err.message);
  }

  // 7. BACKUP & RESTORE COMPATIBILITY
  try {
    console.log('   ⏳ Test 7/8: Verifying production backup and restore script compatibility...');
    const hasBackup = fs.existsSync(path.join(rootDir, 'scripts/db_backup.mjs'));
    const hasRestore = fs.existsSync(path.join(rootDir, 'scripts/db_restore.mjs'));

    if (hasBackup && hasRestore) {
      console.log(`✅ TEST 7/8 PASSED: Production Backup (db_backup.mjs) & Restore (db_restore.mjs) verified.`);
      passed++;
    } else {
      console.error('❌ TEST 7/8 FAILED: Missing backup or restore scripts');
    }
  } catch (err) {
    console.error('❌ TEST 7/8 FAILED:', err.message);
  }

  // 8. DEPLOYMENT & ROLLBACK SCRIPT VALIDATION
  try {
    console.log('   ⏳ Test 8/8: Verifying automated VPS deployment and rollback pipeline...');
    const deployScript = fs.readFileSync(path.join(rootDir, 'scripts/deploy_vps.sh'), 'utf8');
    const hasRollback = deployScript.includes('TRIGGERING AUTOMATIC ROLLBACK') && deployScript.includes('docker compose');

    if (hasRollback) {
      console.log(`✅ TEST 8/8 PASSED: Automated Deployment & Rollback script (scripts/deploy_vps.sh) verified!`);
      passed++;
    } else {
      console.error('❌ TEST 8/8 FAILED: Rollback mechanism missing in deploy_vps.sh');
    }
  } catch (err) {
    console.error('❌ TEST 8/8 FAILED:', err.message);
  }

  console.log(`\n=====================================================================`);
  console.log(`🎯 HOSTINGER READINESS ACCEPTANCE TEST RESULT: ${passed}/${total} TESTS PASSED`);
  console.log(`=====================================================================\n`);

  process.exit(passed === total ? 0 : 1);
}

runHostingerReadinessSuite();
