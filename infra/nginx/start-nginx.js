import { spawnSync, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const nginxExe = 'c:\\tools\\nginx\\nginx.exe';
const nginxDir = 'c:\\tools\\nginx';
const configFile = path.join(__dirname, 'nginx.conf');

if (!fs.existsSync(nginxExe)) {
  console.error(`[Error] NGINX binary not found at ${nginxExe}`);
  process.exit(1);
}

if (!fs.existsSync(configFile)) {
  console.error(`[Error] NGINX config not found at ${configFile}`);
  process.exit(1);
}

// 1. Kill any existing nginx instances
try {
  execSync('taskkill /F /IM nginx.exe', { stdio: 'ignore' });
} catch {
  // Not running
}

// 2. Validate configuration
console.log('[NGINX] Validating configuration...');
const test = spawnSync(nginxExe, ['-p', nginxDir, '-c', configFile, '-t'], {
  encoding: 'utf-8',
  cwd: nginxDir,
});

if (test.status !== 0) {
  console.error('[NGINX] Config test failed:\n', test.stderr || test.stdout);
  process.exit(1);
}

console.log('[NGINX] Configuration syntax is OK.');

// 3. Launch independent background process via CIM Win32_Process on Windows
try {
  const psCmd = `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${nginxExe} -p ${nginxDir} -c ${configFile}'; CurrentDirectory = '${nginxDir}' }`;
  execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'ignore' });

  console.log('\n======================================================');
  console.log('🚀 [NGINX] Started successfully in background!');
  console.log('------------------------------------------------------');
  console.log('  🌐 NGINX Proxy URL : http://localhost:8080');
  console.log('  🎯 Target API      : http://localhost:8000');
  console.log('  🩺 Health Check    : http://localhost:8080/nginx-health');
  console.log('  🛑 Stop Command    : npm run nginx:stop');
  console.log('======================================================\n');
} catch (err) {
  console.error('[Error] Failed to start NGINX:', err.message);
  process.exit(1);
}
