
const crypto = require('node:crypto');
const { list, put } = require('@vercel/blob');

const TOKEN_PREFIX = 'thefrystreet-instagram/private-token/';
const REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';
const REFRESH_AFTER_DAYS = 30;

function encryptionKey() {
  const value = process.env.TOKEN_ENCRYPTION_KEY || '';
  const key = Buffer.from(value, 'base64');

  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)');
  }

  return key;
}

function encrypt(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    encryptionKey(),
    iv
  );

  const content = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final()
  ]);

  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: content.toString('base64')
  });
}

function decrypt(content) {
  const record = JSON.parse(content);

  if (record.v !== 1) {
    throw new Error('Unknown token format');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(record.iv, 'base64')
  );

  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));

  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8'));
}

async function readStoredToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN missing');
  }

  const result = await list({
    prefix: TOKEN_PREFIX,
    limit: 100
  });

  const latest = result.blobs.sort(
    (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
  )[0];

  if (!latest) return null;

  const response = await fetch(latest.url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error('Could not read stored Instagram token');
  }

  const state = decrypt(await response.text());

  if (!state || typeof state.token !== 'string') {
    throw new Error('Stored Instagram token is invalid');
  }

  return state;
}

async function getInstagramToken() {
  const saved = await readStoredToken();

  if (saved) return saved.token;

  const initial = String(
    process.env.INSTAGRAM_ACCESS_TOKEN || ''
  ).trim();

  if (!initial) {
    throw new Error('No Instagram token configured');
  }

  return initial;
}

async function saveToken(state) {
  const pathname =
    TOKEN_PREFIX + new Date().toISOString().replace(/[:.]/g, '-') +
    '-' + crypto.randomBytes(5).toString('hex') + '.json';

  await put(pathname, encrypt(state), {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });
}

async function refreshInstagramToken() {
  const previous = await readStoredToken();

  const token = previous?.token || String(
    process.env.INSTAGRAM_ACCESS_TOKEN || ''
  ).trim();

  if (!token) throw new Error('Instagram token is missing');

  const lastRefresh = previous?.refreshedAt
    ? Date.parse(previous.refreshedAt)
    : 0;

  const elapsedDays = lastRefresh
    ? (Date.now() - lastRefresh) / 86400000
    : null;

  if (
    elapsedDays !== null &&
    elapsedDays < REFRESH_AFTER_DAYS
  ) {
    return {
      status: 'not_due',
      lastRefreshedAt: previous.refreshedAt
    };
  }

  const url = new URL(REFRESH_URL);

  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', token);

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000)
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok || !json.access_token) {
    const code = json.error?.code || null;
    throw new Error(
      'Instagram token refresh rejected. Code: ' + code
    );
  }

  const now = new Date().toISOString();

  await saveToken({
    token: json.access_token,
    refreshedAt: now,
    expiresAt: json.expires_in
      ? new Date(
          Date.now() + Number(json.expires_in) * 1000
        ).toISOString()
      : null
  });

  return {
    status: 'refreshed',
    refreshedAt: now
  };
}

module.exports = {
  getInstagramToken,
  refreshInstagramToken
};
