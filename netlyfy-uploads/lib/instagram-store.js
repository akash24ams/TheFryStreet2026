
const { put, list } = require('@vercel/blob');
const { getInstagramToken } = require('./instagram-token');

const API_URL = 'https://graph.instagram.com/me/media';

const FIELDS =
  'id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,username,children{id,media_type,media_url,thumbnail_url}';

const BASIC_FIELDS =
  'id,media_type,media_url,permalink,thumbnail_url,timestamp,children{id,media_type,media_url,thumbnail_url}';

const PREFIX = 'thefrystreet-instagram/snapshots/';
const MEDIA_PREFIX = 'thefrystreet-instagram/media/';

const POST_LIMIT = 12;

// Read latest saved Instagram backup
async function readSnapshot() {
  const entries = await list({
    prefix: PREFIX,
    limit: 100
  });

  const current = entries.blobs.sort(
    (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
  )[0];

  if (!current) return null;

  const response = await fetch(current.url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error('Failed to read saved snapshot');
  }

  const json = await response.json();

  return Array.isArray(json.data) ? json : null;
}

// Fetch latest posts from Instagram
async function requestInstagram(token, fields) {
  const url = new URL(API_URL);

  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', String(POST_LIMIT));
  url.searchParams.set('access_token', token);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000)
  });

  const json = await response.json().catch(() => ({}));

  return { response, json };
}

// Only allow recognized Instagram media hosts
function trustedMediaUrl(value) {
  try {
    const u = new URL(value);

    return (
      u.protocol === 'https:' &&
      ['cdninstagram.com', 'fbcdn.net', 'instagram.com']
        .some(d =>
          u.hostname === d ||
          u.hostname.endsWith('.' + d)
        )
    );
  } catch (_) {
    return false;
  }
}

// Copy Instagram photos and videos into Vercel Blob
async function mirror(url, id, slot, priorUrl) {
  if (!url) return priorUrl || '';

  if (!trustedMediaUrl(url)) {
    throw new Error('Unexpected media hostname');
  }

  if (
    priorUrl &&
    priorUrl.includes('.public.blob.vercel-storage.com/')
  ) {
    return priorUrl;
  }

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(35000)
  });

  if (!response.ok || !response.body) {
    throw new Error(
      'Media download failed: ' + response.status
    );
  }

  const ct = (
    response.headers.get('content-type') || ''
  ).split(';')[0].toLowerCase();

  if (
    !ct.startsWith('image/') &&
    !ct.startsWith('video/')
  ) {
    throw new Error('Not image/video');
  }

  const ext =
    ct.includes('mp4') ? 'mp4' :
    ct.includes('webp') ? 'webp' :
    ct.includes('png') ? 'png' :
    ct.includes('jpeg') ? 'jpg' :
    ct.includes('quicktime') ? 'mov' : 'bin';

  const path =
    MEDIA_PREFIX +
    encodeURIComponent(String(id)).replace(/%/g, '_') +
    '-' + slot + '.' + ext;

  const result = await put(path, response.body, {
    access: 'public',
    addRandomSuffix: true,
    contentType: ct,
    multipart: true
  });

  return result.url;
}

// Main Instagram backup function
async function syncInstagram() {
  
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error('Blob storage token missing');
}

const instagramToken = await getInstagramToken();


  const previous = await readSnapshot().catch(e => {
    console.error(
      'Could not read previous snapshot:',
      e.message
    );
    return null;
  });

  const previousMap = new Map(
    (previous?.data || []).map(p => [String(p.id), p])
  );

  let result = await requestInstagram(
    instagramToken,
    FIELDS
  );

  if (
    !result.response.ok &&
    result.json?.error?.code === 100
  ) {
    result = await requestInstagram(
      instagramToken,
      BASIC_FIELDS
    );
  }

  if (
    !result.response.ok ||
    !Array.isArray(result.json?.data)
  ) {
    throw new Error(
      'Instagram API unavailable (' +
      result.response.status + ')'
    );
  }

  const output = [];

  for (const p of result.json.data.slice(0, POST_LIMIT)) {
    if (!p?.id) continue;

    const prior = previousMap.get(String(p.id));

    try {
      const media_url = await mirror(
        p.media_url,
        p.id,
        'main',
        prior?.media_url
      );

      const thumbnail_url = p.thumbnail_url
        ? await mirror(
            p.thumbnail_url,
            p.id,
            'poster',
            prior?.thumbnail_url
          )
        : '';

      const children = [];

      for (
        let i = 0;
        i < (p.children?.data || []).length;
        i++
      ) {
        const child = p.children.data[i];

        const old = prior?.children?.data?.find(
          c => String(c.id) === String(child.id)
        );

        children.push({
          id: String(child.id || ''),
          media_type: child.media_type || '',
          media_url: await mirror(
            child.media_url,
            child.id || p.id,
            `child${i}`,
            old?.media_url
          ),
          thumbnail_url: child.thumbnail_url
            ? await mirror(
                child.thumbnail_url,
                child.id || p.id,
                `child${i}-poster`,
                old?.thumbnail_url
              )
            : ''
        });
      }

      if (
        !media_url &&
        !thumbnail_url &&
        !children.some(
          c => c.media_url || c.thumbnail_url
        )
      ) {
        throw new Error('No saved media');
      }

      output.push({
        id: String(p.id),
        caption: p.caption || '',
        media_type: p.media_type || '',
        media_product_type: p.media_product_type || '',
        media_url,
        thumbnail_url,
        permalink: p.permalink || '',
        timestamp: p.timestamp || '',
        username: p.username || '',
        children: { data: children }
      });

    } catch (e) {
      console.error(
        'Media backup failed for a post:',
        e.message
      );

      if (prior) {
        output.push(prior);
      }
    }
  }

  // Keep older saved posts
  for (const p of (previous?.data || [])) {
    if (!output.some(x => x.id === p.id)) {
      output.push(p);
    }
  }

  if (!output.length) {
    throw new Error(
      'No media backed up; previous snapshot preserved'
    );
  }

  output.sort(
    (a, b) =>
      Date.parse(b.timestamp || 0) -
      Date.parse(a.timestamp || 0)
  );

  const savedAt = new Date().toISOString();

  await put(
    PREFIX +
      savedAt.replace(/[:.]/g, '-') +
      '.json',
    JSON.stringify({
      savedAt,
      data: output
    }),
    {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/json'
    }
  );

  return {
    savedAt,
    count: output.length
  };
}

module.exports = {
  readSnapshot,
  syncInstagram
};
