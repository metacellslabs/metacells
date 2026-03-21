const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const role = process.argv[2] || 'web';

const rootDir = path.join(__dirname, '..');
const meteorPortFile = path.join(rootDir, '.meteor', 'local', 'db', 'METEOR-PORT');
const meteorBuildMain = path.join(rootDir, '.meteor', 'local', 'build', 'main.js');

function run(command, args, env) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env
  });

  child.on('exit', code => {
    process.exit(code ?? 0);
  });

  child.on('error', err => {
    console.error(`Failed to start Meteor for role "${role}":`, err);
    process.exit(1);
  });
}

if (role === 'web') {
  run(
    'meteor',
    ['run', '--port', '3400', '--exclude-archs', 'web.browser.legacy', '--no-lint'],
    {
      ...process.env,
      METACELLS_ROLE: 'web'
    }
  );
} else if (role === 'worker') {
  if (!fs.existsSync(meteorPortFile)) {
    console.error('Cannot find .meteor/local/db/METEOR-PORT');
    console.error('Start the web app first so Meteor local MongoDB is initialized.');
    process.exit(1);
  }
  if (!fs.existsSync(meteorBuildMain)) {
    console.error('Cannot find .meteor/local/build/main.js');
    console.error('Start the web app first so the Meteor server bundle is built.');
    process.exit(1);
  }

  const mongoPort = fs.readFileSync(meteorPortFile, 'utf8').trim();

  if (!mongoPort) {
    console.error('METEOR-PORT file is empty.');
    process.exit(1);
  }

  run(
    process.execPath,
    [meteorBuildMain],
    {
      ...process.env,
      METACELLS_ROLE: 'worker',
      MONGO_URL: `mongodb://127.0.0.1:${mongoPort}/meteor`,
      ROOT_URL: 'http://127.0.0.1:3410',
      PORT: '3410',
      BIND_IP: '127.0.0.1',
      METEOR_DISABLE_WATCH: '1'
    }
  );
} else {
  console.error(`Unknown role: ${role}`);
  console.error('Usage: node scripts/run-meteor.js [web|worker]');
  process.exit(1);
}
