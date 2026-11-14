import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureSingleClinic, SingleClinicError } from './config/singleClinic.js';

// Single-clinic mode: exactly one active clinic must exist before the app serves anyone
if (env.singleClinic) {
  try {
    const c = await ensureSingleClinic();
    console.log(`Single-clinic mode: ${c.name} (${c.code})`);
  } catch (err) {
    if (err instanceof SingleClinicError) console.error(`\n${err.message}\n`);
    else console.error('Could not check the clinic in SQL Server:', err.message);
    process.exit(1);
  }
}

const server = createApp().listen(env.port, env.host, () => {
  console.log(`SmartClinic is running:  http://localhost:${env.port}`);
  console.log('Keep this window open while you use the app. Press Ctrl+C to stop.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${env.port} is already in use. Close the other app or change PORT in backend/.env`);
  else console.error(err);
  process.exit(1);
});
