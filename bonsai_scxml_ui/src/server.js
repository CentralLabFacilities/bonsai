import { createServer } from 'node:http';
import assets from '../target/embedded-assets.js';
import { createRequestHandler } from './httpServer.js';

const apiTarget = process.env.API_TARGET || 'http://localhost:8080';
const PORT = parseInt(process.env.PORT || '3000', 10);

const server = createServer(createRequestHandler(assets, { apiTarget }));

server.listen(PORT, () => {
  console.log(`Serving ${Object.keys(assets).length} embedded assets`);
  if (apiTarget) {
    console.log(`API proxy target: ${apiTarget}`);
  }
  console.log(`Listening on http://localhost:${PORT}`);
});
