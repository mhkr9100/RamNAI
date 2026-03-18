const target = process.argv[2];

if (!target || !['mac', 'win'].includes(target)) {
  throw new Error('Usage: node scripts/verify-signing-env.mjs <mac|win>');
}

const env = process.env;
const missing = [];

if (target === 'mac') {
  const hasSigningIdentity = Boolean(env.CSC_LINK || env.CSC_NAME);
  const hasSigningPassword = Boolean(env.CSC_KEY_PASSWORD || env.APPLE_CERT_PASSWORD || env.CSC_KEYCHAIN);
  const hasNotary = Boolean(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);

  if (!hasSigningIdentity) missing.push('CSC_LINK or CSC_NAME');
  if (!hasSigningPassword) missing.push('CSC_KEY_PASSWORD or APPLE_CERT_PASSWORD or CSC_KEYCHAIN');
  if (!hasNotary) missing.push('APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID');
}

if (target === 'win') {
  const hasSigningIdentity = Boolean(env.WIN_CSC_LINK || env.CSC_LINK);
  const hasSigningPassword = Boolean(env.WIN_CSC_KEY_PASSWORD || env.CSC_KEY_PASSWORD);

  if (!hasSigningIdentity) missing.push('WIN_CSC_LINK or CSC_LINK');
  if (!hasSigningPassword) missing.push('WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD');
}

if (missing.length) {
  throw new Error(`Missing signing environment for ${target} release packaging: ${missing.join(', ')}`);
}

console.log(`PASS signing environment ready for ${target} release packaging`);
