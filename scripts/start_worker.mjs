import './workerRole.mjs';
import { startBackgroundWorkers, stopBackgroundWorkers } from '../lib/schedulerWorker.mjs';

startBackgroundWorkers();

function shutdown(signal) {
  console.log(`[Worker] ${signal} received, stopping...`);
  stopBackgroundWorkers();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
