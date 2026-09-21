import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import { getPlatformProxy } from 'wrangler';
import type { IncomingMessage } from 'node:http';
import { api } from './server/worker';
import type { Env } from './server/env';

// The development Sites plugin only simulates an authenticated user on a loopback
// connection. Remove any client-provided identity before that plugin can inject one.
// This middleware must remain before sites() and rolescout-api in the plugins array.
const inspectedRequests = new WeakSet<IncomingMessage>();

function clearClientIdentity(request: IncomingMessage): void {
  for (const name of Object.keys(request.headers)) {
    if (name.toLowerCase().startsWith('oai-authenticated-user-')) {
      delete request.headers[name];
    }
  }
  for (let index = request.rawHeaders.length - 2; index >= 0; index -= 2) {
    if (request.rawHeaders[index].toLowerCase().startsWith('oai-authenticated-user-')) {
      request.rawHeaders.splice(index, 2);
    }
  }
  inspectedRequests.add(request);
}

function isSitesLocalIdentity(request: IncomingMessage): boolean {
  if (!inspectedRequests.has(request)) return false;
  if (
    request.headers['oai-authenticated-user-id'] !== 'local_seedy' ||
    request.headers['oai-authenticated-user-email'] !== 'seedy@sites.test'
  )
    return false;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? ''))
    return false;
  try {
    const authority = new URL(`http://${request.headers.host}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(authority.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export default defineConfig({
  plugins: [
    {
      name: 'rolescout-identity-ingress',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          clearClientIdentity(request);
          next();
        });
      },
    },
    react(),
    sites(),
    {
      name: 'rolescout-api',
      async configureServer(server) {
        const proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc' });
        server.httpServer?.on('close', () => void proxy.dispose());
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/')) return next();
          // The local Sites simulator has no cryptographically authenticated cookie.
          // Accept only the identity it itself injects after the ingress scrub.
          if (!isSitesLocalIdentity(req)) {
            res.statusCode = 401;
            res.setHeader('Cache-Control', 'private, no-store');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '로그인이 필요합니다.' }));
            return;
          }
          try {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 6_000_000) {
                res.statusCode = 413;
                res.end();
                return;
              }
              chunks.push(chunk);
            }
            // Forward only headers the Worker API uses, never arbitrary client headers.
            const headers = new Headers();
            for (const name of [
              'oai-authenticated-user-id',
              'oai-authenticated-user-email',
              'origin',
              'x-rolescout',
              'content-type',
            ]) {
              const value = req.headers[name];
              if (typeof value === 'string') headers.set(name, value);
            }
            const request = new Request(`http://${req.headers.host}${req.url}`, {
              method: req.method,
              headers,
              body: ['GET', 'HEAD'].includes(req.method ?? 'GET')
                ? undefined
                : Buffer.concat(chunks),
            });
            const result = await api(request, proxy.env);
            res.statusCode = result.status;
            result.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await result.arrayBuffer()));
          } catch {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: '로컬 서버 오류' }));
          }
        });
      },
    },
  ],
  build: { outDir: 'dist/client' },
});
