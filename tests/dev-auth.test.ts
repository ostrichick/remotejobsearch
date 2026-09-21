import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('local Vite proxy discards forged identity and accepts only the Sites mock sign-in', async () => {
  const server = await createServer({
    configFile: 'vite.config.ts',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false },
  });
  try {
    await server.listen();
    const address = server.httpServer?.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const forged = {
      'oai-authenticated-user-id': 'victim-user',
      'oai-authenticated-user-email': 'victim@example.invalid',
    };

    const anonymous = await fetch(`${base}/api/me`);
    assert.equal(anonymous.status, 401);
    const attacker = await fetch(`${base}/api/me`, { headers: forged });
    assert.equal(attacker.status, 401, 'a supplied ID must not create a session');

    const signIn = await fetch(`${base}/signin-with-chatgpt?return_to=/`, { redirect: 'manual' });
    assert.equal(signIn.status, 302);
    const cookie = signIn.headers.get('set-cookie')?.split(';', 1)[0];
    assert.equal(cookie, '__sites_local_auth=1');

    const signedIn = await fetch(`${base}/api/me`, { headers: { Cookie: cookie! } });
    assert.equal(signedIn.status, 200);
    const identity = (await signedIn.json()) as { email: string };
    assert.equal(identity.email, 'seedy@sites.test');

    const forgedAfterSignIn = await fetch(`${base}/api/me`, {
      headers: { ...forged, Cookie: cookie! },
    });
    assert.equal(forgedAfterSignIn.status, 200);
    assert.equal(((await forgedAfterSignIn.json()) as { email: string }).email, identity.email);
    assert.equal(
      (await fetch(`${base}/api/profile`, { headers: { Cookie: cookie! } })).status,
      200,
    );

    const signOut = await fetch(`${base}/signout-with-chatgpt?return_to=/`, {
      headers: { Cookie: cookie! },
      redirect: 'manual',
    });
    assert.equal(signOut.status, 302);
    assert.match(signOut.headers.get('set-cookie') ?? '', /Max-Age=0/);
    assert.equal((await fetch(`${base}/api/me`, { headers: forged })).status, 401);
  } finally {
    await server.close();
  }
});
