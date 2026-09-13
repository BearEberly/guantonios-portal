import { mkdirSync, copyFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
for (const route of ['reservations', 'manage', 'operator', 'sms', 'sms/privacy', 'sms/terms']) {
  const dir = join(dist, route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(dist, 'index.html'), join(dir, 'index.html'));
}
const redirects = join(dist, '_redirects');
if (existsSync(redirects)) unlinkSync(redirects);
