import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Desktop shell: sets up environment, boots the bundled Express server
 * in-process, then opens a window on it. Data lives in the same local MySQL
 * the web version uses.
 *
 * Defaults can be overridden in <userData>/config.json, e.g.
 *   { "DATABASE_URL": "mysql://root@localhost:3306/leetcode_tracker" }
 */

const ENV_DEFAULTS = {
  NODE_ENV: 'production',
  LOCAL_DESKTOP: '1',
  DATABASE_URL: 'mysql://root@localhost:3306/leetcode_tracker',
  OWNER_OPEN_ID: 'local-dev',
  BUILT_IN_FORGE_API_URL: 'https://llm-router.butterfly-effect.dev',
  BUILT_IN_FORGE_API_KEY: 'unused',
};

const PREFERRED_PORT = 3900;

function applyEnv() {
  for (const [k, v] of Object.entries(ENV_DEFAULTS)) {
    if (!process.env[k]) process.env[k] = v;
  }
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const overrides = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      for (const [k, v] of Object.entries(overrides)) {
        if (typeof v === 'string') process.env[k] = v;
      }
    }
  } catch (e) {
    console.error('[desktop] bad config.json, ignoring:', e.message);
  }
}

async function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: 'LeetCode Tracker',
    titleBarStyle: 'hiddenInset',
    webPreferences: { contextIsolation: true },
  });
  // External links open in the system browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`http://localhost:${port}/`);
  return win;
}

let serverPort = null;

app.whenReady().then(async () => {
  applyEnv();
  try {
    const { startServer } = await import('./server.mjs');
    serverPort = await startServer({
      staticDir: path.join(app.getAppPath(), 'dist', 'public'),
      preferredPort: PREFERRED_PORT,
    });
    await createWindow(serverPort);
  } catch (e) {
    dialog.showErrorBox(
      'LeetCode Tracker 启动失败',
      `服务启动出错:\n\n${e.message}\n\n` +
        '最常见的原因是本机 MySQL 未运行(数据库地址:' +
        `${process.env.DATABASE_URL})。\n启动 MySQL 后重新打开应用即可。`,
    );
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
      createWindow(serverPort);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
