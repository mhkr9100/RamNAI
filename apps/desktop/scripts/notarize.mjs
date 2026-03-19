import path from 'node:path';

const APP_BUNDLE_ID = 'ai.raman.app';

export default async function notarizeApp(context) {
  if (process.platform !== 'darwin') {
    return;
  }

  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[notarize] Skipping notarization');
    return;
  }

  const { notarize } = await import('@electron/notarize');
  const productFilename = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);

  await notarize({
    appBundleId: APP_BUNDLE_ID,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
}
/**
 * macOS notarization script for electron-builder afterSign hook.
 *
 * Requires environment variables:
 *   APPLE_ID          — Apple ID email
 *   APPLE_PASSWORD    — App-specific password
 *   APPLE_TEAM_ID     — Apple Developer Team ID
 *
 * When these are not set (e.g. local dev builds), notarization is skipped.
 */

import { notarize } from '@electron/notarize';

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    console.log('[notarize] Skipping — not macOS.');
    return;
  }

  const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;

  if (!APPLE_ID || !APPLE_PASSWORD || !APPLE_TEAM_ID) {
    console.log('[notarize] Skipping — APPLE_ID, APPLE_PASSWORD, or APPLE_TEAM_ID not set.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Notarizing ${appPath}...`);

  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });

  console.log('[notarize] Done.');
}
