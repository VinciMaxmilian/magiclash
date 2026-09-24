import { loadConfig } from './config';
import { startServer } from './server';

const server = startServer(loadConfig());

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
