import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Desktop shell: sets up environment, boots the bundled Express server
 * in-process, then opens a window on it. Data lives in the same local MySQL
 * the web version uses.
 *
 * Defaults can be overridden in <userData>/config.json, e.g.
 *   {
 *     "DATABASE_URL": "mysql://root@localhost:3306/leetcode_tracker",
 *     "BUILT_IN_FORGE_API_URL": "https://api.openai.com",
 *     "BUILT_IN_FORGE_API_KEY": "sk-...",
 *     "BUILT_IN_FORGE_MODEL": "your-model-id"
 *   }
 *
 * No model endpoint is bundled on purpose: AI features (test-case generation,
 * AI solutions, translation) are opt-in and run against a key the user owns.
 * Everything else — browsing, sync, judging anything with stored test data —
 * works without one.
 */

const ENV_DEFAULTS = {
  NODE_ENV: 'production',
  LOCAL_DESKTOP: '1',
  DATABASE_URL: 'mysql://root@localhost:3306/leetcode_tracker',
  OWNER_OPEN_ID: 'local-dev',
};

const PREFERRED_PORT = 3900;

// --- single instance: focus the existing window instead of a second process
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

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

// --- window state persistence
function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
  } catch {
    return null;
  }
}

function trackWindowState(win) {
  let timer = null;
  const save = () => {
    if (win.isDestroyed()) return;
    const state = { ...win.getBounds(), maximized: win.isMaximized() };
    fs.writeFile(windowStatePath(), JSON.stringify(state), () => {});
  };
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  win.on('resize', debounced);
  win.on('move', debounced);
  win.on('close', save);
}

// --- application menu (roles give standard behavior: ⌘C/⌘V, ⌘W, ⌘Q, zoom…)
function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 LeetCode Tracker' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 LeetCode Tracker' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '显示',
      submenu: [
        { role: 'reload', label: '刷新' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入/退出全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭窗口' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- right-click context menu (copy/paste in inputs, copy for selections)
function attachContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const items = [];
    if (params.isEditable) {
      items.push(
        { role: 'undo', label: '撤销', enabled: params.editFlags.canUndo },
        { type: 'separator' },
        { role: 'cut', label: '剪切', enabled: params.editFlags.canCut },
        { role: 'copy', label: '拷贝', enabled: params.editFlags.canCopy },
        { role: 'paste', label: '粘贴', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: '全选' },
      );
    } else if (params.selectionText.trim()) {
      items.push({ role: 'copy', label: '拷贝' });
    }
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}

async function createWindow(port) {
  const saved = loadWindowState();
  const win = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 920,
    x: saved?.x,
    y: saved?.y,
    minWidth: 900,
    minHeight: 600,
    title: 'LeetCode Tracker',
    webPreferences: { contextIsolation: true },
  });
  if (saved?.maximized) win.maximize();
  trackWindowState(win);
  attachContextMenu(win);
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
  app.setAboutPanelOptions({
    applicationName: 'LeetCode Tracker',
    applicationVersion: app.getVersion(),
    copyright: '本地刷题应用 — 数据存储于本机 MySQL',
  });
  buildMenu();
  applyEnv();
  try {
    const { startServer, ensureSeeded, ensureDesktopSchema } = await import('./server.mjs');
    // First run on a fresh machine: create the database and import the
    // bundled content snapshot so the app works without a manual sync.
    await ensureSeeded({
      databaseUrl: process.env.DATABASE_URL,
      seedPath: path.join(process.resourcesPath, 'seed.sql.gz'),
    });
    // Existing databases are not reseeded, so apply guarded additive DDL on every launch.
    await ensureDesktopSchema({ databaseUrl: process.env.DATABASE_URL });
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
