require('dotenv').config();

const { initDb } = require('./db/init');
const app = require('./app');

async function start() {
  await initDb();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('[server] startup failed:', err.message);
  process.exit(1);
});
