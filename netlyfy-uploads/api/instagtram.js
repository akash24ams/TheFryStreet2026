
// The Fry Street — Instagram Feed API
// Vercel Environment Variable: INSTAGRAM_ACCESS_TOKEN
// Optional for Facebook Login: INSTAGRAM_USER_ID

module.exports = async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=300, stale-while-revalidate=300'
  );
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const token = String(
    process.env.INSTAGRAM_ACCESS_TOKEN || ''
  ).trim();

  const userId = String(
    process.env.INSTAGRAM_USER_ID || ''
  ).trim();

  // Check whether the function and token are configured
  if (String(req.query?.health || '') === '1') {
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      status: 'ok',
      function: 'instagram',
      token_configured: Boolean(token),
      mode: userId ? 'facebook-login' : 'instagram-login'
    });
  }

  if (!token) {
    res.setHeader('Cache-Control', 'no-store');

    return res.status(503).json({
      error: 'Instagram token is not configured in Vercel Production.'
    });
  }

  const base = userId
    ? `https://graph.facebook.com/v25.0/${encodeURIComponent(userId)}/media`
    : 'https://graph.instagram.com/me/media';

  const url = new URL(base);

  url.searchParams.set(
    'fields',
    'id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,children{id,media_type,media_url,thumbnail_url}'
  );

  url.searchParams.set('limit', '50');

  const fields = [
    'id',
    'caption',
    'media_type',
    'media_product_type',
    'media_url',
    'permalink',
    'thumbnail_url',
    'timestamp'
  ];

  function sanitize(media) {
    const result = {};

    for (const key of fields) {
      if (
        typeof media?.[key] === 'string' &&
        !media[key].includes(token)
      ) {
        result[key] = media[key];
      }
    }

    if (Array.isArray(media?.children?.data)) {
      result.children = {
        data: media.children.data.map(sanitize)
      };
    }

    return result;
  }

  try {
    const posts = [];
    const cursors = new Set();
    let hasMore = false;

    for (let page = 0; page < 3; page++) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal: AbortSignal.timeout(15000)
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload.error) {
        console.error('Instagram upstream failure', {
          status: response.status,
          code: payload.error?.code,
          subcode: payload.error?.error_subcode
        });

        res.setHeader('Cache-Control', 'no-store');

        return res.status(502).json({
          error: 'Instagram API request failed.',
          upstream_status: response.status,
          code: payload.error?.code ?? null
        });
      }

      if (!Array.isArray(payload.data)) {
        res.setHeader('Cache-Control', 'no-store');

        return res.status(502).json({
          error: 'Instagram returned an unexpected response.'
        });
      }

      posts.push(...payload.data);

      const after = payload.paging?.cursors?.after;

      hasMore = Boolean(
        payload.paging?.next &&
        typeof after === 'string' &&
        after
      );

      if (!hasMore || cursors.has(after)) {
        break;
      }

      cursors.add(after);
      url.searchParams.set('after', after);
    }

    const unique = [
      ...new Map(
        posts
          .filter(post => post?.id)
          .map(post => [post.id, post])
      ).values()
    ];

    return res.status(200).json({
      data: unique.map(sanitize),
      has_more: hasMore
    });

  } catch (error) {
    console.error('Instagram request error:', error.name);

    res.setHeader('Cache-Control', 'no-store');

    return res.status(502).json({
      error: 'Instagram temporarily unavailable.'
    });
  }
};
