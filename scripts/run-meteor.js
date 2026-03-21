const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const role = process.argv[2] || 'web';

const rootDir = path.join(__dirname, '..');
const meteorPortFile = path.join(rootDir, '.meteor', 'local', 'db', 'METEOR-PORT');

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

  const mongoPort = fs.readFileSync(meteorPortFile, 'utf8').trim();

  if (!mongoPort) {
    console.error('METEOR-PORT file is empty.');
    process.exit(1);
  }

  run(
    'meteor',
    ['run', '--port', '3410', '--exclude-archs', 'web.browser.legacy'],
    {
      ...process.env,
      METACELLS_ROLE: 'worker',
      MONGO_URL: `mongodb://127.0.0.1:${mongoPort}/meteor`,
      ROOT_URL: 'http://127.0.0.1:3410'
    }
  );
} else {
  console.error(`Unknown role: ${role}`);
  console.error('Usage: node scripts/run-meteor.js [web|worker]');
  process.exit(1);
}