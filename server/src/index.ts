import express from 'express';
import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { __dirname, SCREENSHOTS_DIR } from './config.js';
import apiRouter from './routes/api.js';
import { encodeManager } from './encodeManager.js';

const app: Express = express();
const port = process.env.PORT || 8080;

// --- Middleware and Static Serving ---
app.use(express.json());

// Ensure the main screenshots directory exists and serve it
fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
app.use('/screenshots', express.static(SCREENSHOTS_DIR));
// ----------------------------------------------------

// --- Mount API Router ---
app.use('/api', apiRouter);
// ------------------------------------------

// --- Production-Only Static File Serving ---
if (process.env.NODE_ENV === 'production') {
  const reactAppPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(reactAppPath));
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(reactAppPath, 'index.html'));
  });
}
// ------------------------------------------

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
  encodeManager.initialize();
});