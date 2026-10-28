
/*
 * THE FRY STREET — INSTAGRAM FEED
 *
 * Live Instagram API + Vercel Blob backup fallback
 *
 * Vercel environment variables:
 *   INSTAGRAM_ACCESS_TOKEN
 *   BLOB_READ_WRITE_TOKEN
 *
 * Supported URLs:
 *   /api/feed
 *   /api/feed?backup=1
 *   /api/feed?health=1
 */

const INSTAGRAM_URL =
  'https://graph.instagram.com/me/media';

const FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,' +
  'permalink,timestamp,' +
  'children{id,media_type,media_url,thumbnail_url}';

function cleanMedia(media) {
  const result = {};

  const allowed = [
    'id',
    'caption',
    'media_type',
    'media_url',
    'thumbnail_url',
    'permalink',
    'timestamp'
  ];

  for (const key of allowed) {
    if (typeof media?.[key] === 'string') {
      result[key] = media[key];
    }
  }

  if (Array.isArray(media?.children?.data)) {
    result.children = {
      data: media.children.data.map(cleanMedia)
    };
  }

  return result;
}

async function getSavedBackup() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Blob storage token missing');
  }

  // Existing module:
  // netlify-uploads/lib/instagram-store.js
  const { readSnapshot } = require(
    '../lib/instagram-store'
  );

  const snapshot = await readSnapshot();

  if (
    !snapshot ||
    !Array.isArray(snapshot.data) ||
    snapshot.data.length === 0
  ) {
    throw new Error('No saved Instagram backup');
  }

  return {
    data: snapshot.data.map(cleanMedia),
    has_more: false,
    source: 'persistent-backup',
    savedAt: snapshot.savedAt || null
  };
}

async function getLiveInstagram(token) {
  const url = new URL(INSTAGRAM_URL);

  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('limit', '50');

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(20000)
  });

  const json = await response.json().catch(
    () => ({})
  );

  if (
    !response.ok ||
    json.error ||
    !Array.isArray(json.data)
  ) {
    console.error('Live Instagram request failed', {
      status: response.status,
      code: json.error?.code || null
    });

    throw new Error('Instagram live API unavailable');
  }

  return {
    data: json.data.map(cleanMedia),
    has_more: Boolean(json.paging?.next),
    source: 'live-instagram'
  };
}

module.exports = async function handler(req, res) {
  res.setHeader(
    'Content-Type',
    'application/json; charset=utf-8'
  );

  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const requestUrl = new URL(
    req.url || '/',
    'https://localhost'
  );

  const backupOnly =
    requestUrl.searchParams.get('backup') === '1';

  const healthCheck =
    requestUrl.searchParams.get('health') === '1';

  if (healthCheck) {
    return res.status(200).json({
      status: 'ok',
      function: 'feed',
      backup_fallback_enabled: true,
      token_configured: Boolean(
        process.env.INSTAGRAM_ACCESS_TOKEN
      ),
      blob_configured: Boolean(
        process.env.BLOB_READ_WRITE_TOKEN
      )
    });
  }

  // Test the saved backup WITHOUT contacting Instagram.
  if (backupOnly) {
    try {
      const backup = await getSavedBackup();

      return res.status(200).json(backup);
    } catch (error) {
      console.error(
        'Backup-only request failed:',
        error.message
      );

      return res.status(503).json({
        error: 'Saved Instagram backup unavailable',
        source: 'backup-error'
      });
    }
  }

  const token = String(
    process.env.INSTAGRAM_ACCESS_TOKEN || ''
  ).trim();

  // Try live Instagram first.
  if (token) {
    try {
      const liveFeed = await getLiveInstagram(token);

      return res.status(200).json(liveFeed);
    } catch (error) {
      console.error(
        'Switching to saved Instagram backup:',
        error.message
      );
    }
  } else {
    console.error(
      'Instagram token missing; trying backup'
    );
  }

  // If Instagram fails or token becomes invalid,
  // automatically return previously saved media.
  try {
    const backup = await getSavedBackup();

    return res.status(200).json({
      ...backup,
      fallback: true
    });
  } catch (error) {
    console.error(
      'Instagram backup fallback failed:',
      error.message
    );

    return res.status(503).json({
      error:
        'Live Instagram and saved backup are unavailable'
    });
  }
};
