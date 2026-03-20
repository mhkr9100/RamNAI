import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

export function setupTray(getMainWindow: () => BrowserWindow | null): void {
  if (tray) return;

  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    icon = icon.resize({ width: 18, height: 18 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('RamN AI');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open RamN AI',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quick Ask Prism',
      accelerator: 'CommandOrControl+Shift+P',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
          win.webContents.send('navigate', 'prism');
        }
      },
    },
    {
      label: 'Voice Mode',
      accelerator: 'CommandOrControl+Shift+V',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
          win.webContents.send('voice:toggle');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Status',
      submenu: [
        {
          label: 'Heartbeat: Active',
          enabled: false,
        },
        {
          label: 'Ollama: Running',
          enabled: false,
        },
        {
          label: 'Runtime Bridge: Running',
          enabled: false,
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        const win = getMainWindow();
        if (win) {
          win.show();
          win.focus();
          win.webContents.send('navigate', 'settings');
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit RamN AI',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    }
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
