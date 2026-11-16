import { execSync } from 'node:child_process';

const nginxExe = 'c:\\tools\\nginx\\nginx.exe';
const nginxDir = 'c:\\tools\\nginx';

try {
  execSync(`"${nginxExe}" -p "${nginxDir}" -s stop`, { stdio: 'ignore' });
} catch {
  // Graceful stop fallback
}

try {
  execSync('powershell -NoProfile -Command "Get-Process nginx -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  console.log('[NGINX] Stopped successfully.');
} catch {
  console.log('[NGINX] Stopped.');
}
