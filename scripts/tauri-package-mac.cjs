const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { cargoTargetDir, ensureCleanCargoTarget, projectRoot } = require('./tauri-target.cjs');
const nodeRuntimeEntitlementsPath = path.join(
  projectRoot,
  'src-tauri',
  'node-runtime.entitlements',
);

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || cargoTargetDir,
      },
      ...options,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

function removeIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function listMountedDiskImages() {
  const output = execFileSync('hdiutil', ['info'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
  });
  const lines = String(output || '').split('\n');
  const images = [];
  let current = null;

  for (const rawLine of lines) {
    const line = String(rawLine || '');
    if (line.startsWith('image-path      : ')) {
      if (current) images.push(current);
      current = {
        imagePath: line.slice('image-path      : '.length).trim(),
        mounts: [],
      };
      continue;
    }
    if (!current) continue;
    const mountMatch = line.match(/^\S+\s+\S+\s+(.+)$/);
    if (mountMatch && mountMatch[1] && mountMatch[1].startsWith('/Volumes/')) {
      current.mounts.push(mountMatch[1].trim());
    }
  }
  if (current) images.push(current);
  return images;
}

function detachMountedImage(target) {
  try {
    execFileSync('hdiutil', ['detach', target, '-force'], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });
  } catch (error) {
    console.warn('[desktop:dist:tauri:mac] failed to detach mounted image', {
      target,
      error: error && error.message ? error.message : String(error || ''),
    });
  }
}

function detachStaleDmgMounts(productName, dmgPath) {
  const normalizedDmgPath = path.resolve(dmgPath);
  const mountedImages = listMountedDiskImages();
  const volumePrefix = `/Volumes/${productName}`;
  const targets = new Set();

  for (const image of mountedImages) {
    const imagePath = path.resolve(String(image.imagePath || ''));
    const mounts = Array.isArray(image.mounts) ? image.mounts : [];
    const matchesDmgPath = imagePath === normalizedDmgPath;
    const matchesProductVolume = mounts.some((mountPath) => {
      return (
        mountPath === volumePrefix ||
        mountPath.startsWith(`${volumePrefix} `)
      );
    });
    if (!matchesDmgPath && !matchesProductVolume) continue;
    mounts.forEach((mountPath) => targets.add(mountPath));
  }

  Array.from(targets)
    .sort()
    .reverse()
    .forEach((mountPath) => detachMountedImage(mountPath));
}

function ensureSymlink(target, linkPath) {
  try {
    fs.symlinkSync(target, linkPath);
  } catch (error) {
    if (error && error.code === 'EEXIST') return;
    throw error;
  }
}

function archLabel() {
  if (process.arch === 'arm64') return 'aarch64';
  if (process.arch === 'x64') return 'x64';
  return process.arch;
}

function getOptionalEnv(name) {
  const value = String(process.env[name] || '').trim();
  return value || '';
}

function listCodesignIdentities() {
  const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
  });
  return String(output)
    .split('\n')
    .map((line) => {
      const match = line.match(/\)\s+[0-9A-F]+\s+"([^"]+)"/);
      return match ? match[1] : '';
    })
    .filter(Boolean);
}

function resolveCodesignIdentity() {
  const requestedIdentity = getOptionalEnv('APPLE_SIGN_IDENTITY');
  const requestedTeamId = getOptionalEnv('APPLE_TEAM_ID');
  const allIdentities = listCodesignIdentities();
  const developerIdIdentities = allIdentities.filter((identity) =>
    identity.startsWith('Developer ID Application: '),
  );

  if (requestedIdentity) {
    if (allIdentities.includes(requestedIdentity)) {
      return requestedIdentity;
    }
    console.warn(
      `[desktop:dist:tauri:mac] APPLE_SIGN_IDENTITY not found in keychain, ignoring value: ${requestedIdentity}`,
    );
  }

  let matchingIdentities = developerIdIdentities;
  if (requestedTeamId) {
    matchingIdentities = matchingIdentities.filter((identity) =>
      identity.includes(`(${requestedTeamId})`),
    );
  }

  if (matchingIdentities.length === 1) {
    console.log('[desktop:dist:tauri:mac] using detected signing identity', {
      identity: matchingIdentities[0],
    });
    return matchingIdentities[0];
  }

  if (!matchingIdentities.length) {
    if (!requestedIdentity && !requestedTeamId) {
      console.log(
        '[desktop:dist:tauri:mac] codesign skipped: no Developer ID Application identity found and APPLE_SIGN_IDENTITY is not set',
      );
      return '';
    }
    throw new Error(
      `No matching Developer ID Application identity found${
        requestedTeamId ? ` for team ${requestedTeamId}` : ''
      }. Available identities: ${developerIdIdentities.join(' | ') || 'none'}`,
    );
  }

  throw new Error(
    `Multiple Developer ID Application identities match${
      requestedTeamId ? ` team ${requestedTeamId}` : ''
    }. Set APPLE_SIGN_IDENTITY to one of: ${matchingIdentities.join(' | ')}`,
  );
}

function listEmbeddedMachOBinaries(rootPath) {
  const output = execFileSync('find', [rootPath, '-type', 'f', '-print0'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'buffer',
  });
  const paths = String(output)
    .split('\0')
    .map((value) => value.trim())
    .filter(Boolean);

  return paths.filter((filePath) => {
    try {
      const description = execFileSync('file', [filePath], {
        cwd: projectRoot,
        env: process.env,
        encoding: 'utf8',
      });
      return description.includes('Mach-O');
    } catch (_error) {
      return false;
    }
  });
}

async function codesignFile(targetPath, identity, extraArgs = []) {
  await run('codesign', [
    '--force',
    '--timestamp',
    '--sign',
    identity,
    ...extraArgs,
    targetPath,
  ]);
}

async function codesignEmbeddedBinaries(appBundlePath, identity) {
  const embeddedBinaries = listEmbeddedMachOBinaries(appBundlePath).filter(
    (filePath) => filePath !== path.join(appBundlePath, 'Contents', 'MacOS', 'metacells_tauri'),
  );

  for (const binaryPath of embeddedBinaries) {
    const extraArgs = ['--options', 'runtime'];
    if (
      binaryPath.endsWith(`${path.sep}.desktop-runtime${path.sep}node${path.sep}node`) &&
      fs.existsSync(nodeRuntimeEntitlementsPath)
    ) {
      extraArgs.push('--entitlements', nodeRuntimeEntitlementsPath);
    }
    await codesignFile(binaryPath, identity, extraArgs);
  }

  if (embeddedBinaries.length) {
    console.log('[desktop:dist:tauri:mac] embedded binary codesign complete', {
      count: embeddedBinaries.length,
    });
  }
}

async function codesignApp(appBundlePath, identity) {
  await codesignEmbeddedBinaries(appBundlePath, identity);

  await codesignFile(appBundlePath, identity, [
    '--deep',
    '--options',
    'runtime',
  ]);

  await run('codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appBundlePath,
  ]);

  console.log('[desktop:dist:tauri:mac] codesign complete', { appBundlePath });
  return true;
}

async function codesignDmg(dmgPath, identity) {
  await codesignFile(dmgPath, identity);

  await run('codesign', [
    '--verify',
    '--verbose=2',
    dmgPath,
  ]);

  console.log('[desktop:dist:tauri:mac] dmg codesign complete', { dmgPath });
  return true;
}

async function notarizeDmg(dmgPath) {
  const keychainProfile = getOptionalEnv('APPLE_NOTARY_PROFILE');
  if (!keychainProfile) {
    console.log('[desktop:dist:tauri:mac] notarization skipped: APPLE_NOTARY_PROFILE is not set');
    return false;
  }

  await run('xcrun', [
    'notarytool',
    'submit',
    dmgPath,
    '--keychain-profile',
    keychainProfile,
    '--wait',
  ]);

  await run('xcrun', ['stapler', 'staple', dmgPath]);
  console.log('[desktop:dist:tauri:mac] notarization complete', { dmgPath });
  return true;
}

async function main() {
  ensureCleanCargoTarget();

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const productName = String(
    (packageJson.build && packageJson.build.productName) || packageJson.name || 'MetaCells',
  );
  const version = String(packageJson.version || '0.0.0');
  const tauriCli = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';

  await run(tauriCli, ['build', '--config', 'src-tauri/tauri.conf.json', '--bundles', 'app']);

  const appBundlePath = path.join(
    cargoTargetDir,
    'release',
    'bundle',
    'macos',
    `${productName}.app`,
  );
  if (!fs.existsSync(appBundlePath)) {
    throw new Error(`Expected app bundle at ${appBundlePath}`);
  }

  const identity = resolveCodesignIdentity();
  if (identity) {
    await codesignApp(appBundlePath, identity);
  }

  const dmgDir = path.join(
    cargoTargetDir,
    'release',
    'bundle',
    'dmg',
  );
  fs.mkdirSync(dmgDir, { recursive: true });

  const fileBase = `${productName}_${version}_${archLabel()}`;
  const dmgPath = path.join(dmgDir, `${fileBase}.dmg`);
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metacells-tauri-dmg-'));

  try {
    const stagedAppPath = path.join(stagingDir, `${productName}.app`);
    fs.cpSync(appBundlePath, stagedAppPath, { recursive: true });
    ensureSymlink('/Applications', path.join(stagingDir, 'Applications'));
    detachStaleDmgMounts(productName, dmgPath);
    removeIfExists(dmgPath);

    await run('hdiutil', [
      'create',
      '-volname',
      productName,
      '-srcfolder',
      stagingDir,
      '-ov',
      '-format',
      'UDZO',
      dmgPath,
    ]);

    if (identity) {
      await codesignDmg(dmgPath, identity);
      await notarizeDmg(dmgPath);
    }

    console.log('[desktop:dist:tauri:mac] ready', { appBundlePath, dmgPath });
  } finally {
    removeIfExists(stagingDir);
  }
}

main().catch((error) => {
  console.error('[desktop:dist:tauri:mac] failed');
  console.error(error);
  process.exit(1);
});
