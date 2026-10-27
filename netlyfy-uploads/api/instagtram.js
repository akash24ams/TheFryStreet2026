
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (process.env.INSTAGRAM_ACCESS_TOKEN || '').trim();
  const userId = (process.env.INSTAGRAM_USER_ID || '').trim();

  // Check that Vercel is actually executing this function.
  if (req.query?.health === '1') {
    return res.status(200).json({
      status: 'ok',
      function: 'instagram',
      token_configured: Boolean(token),
      mode: userId ? 'facebook-login' : 'instagram-login'
    });
  }

  if (!token) {
    return res.status(503).json({
      error: 'INSTAGRAM_ACCESS_TOKEN is missing in this deployment.'
    });
  }

  const base = userId
    ? `https://graph.facebook.com/v24.0/${encodeURIComponent(userId)}/media`
    : 'https://graph.instagram.com/me/media';

  const url = new URL(base);

  url.searchParams.set(
    'fields',
    'id,media_type,media_url,permalink,thumbnail_url,timestamp,children{id,media_type,media_url,thumbnail_url}'
  );

  url.searchParams.set('limit', '50');

  try {
    const posts = [];
    const seen = new Set();

    for (let page = 0; page < 3; page++) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal: AbortSignal.timeout(15000)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.error) {
        console.error('Instagram API error', {
          status: response.status,
          code: result.error?.code,
          subcode: result.error?.error_subcode,
          type: result.error?.type
        });

        return res.status(502).json({
          error: 'Instagram API request failed.',
          upstream_status: response.status,
          code: result.error?.code ?? null,
          subcode: result.error?.error_subcode ?? null
        });
      }

      if (!Array.isArray(result.data)) {
        return res.status(502).json({
          error: 'Unexpected Instagram API response.'
        });
      }

      posts.push(...result.data);

      const after = result.paging?.cursors?.after;

      if (!result.paging?.next || !after || seen.has(after)) {
        break;
      }

      seen.add(after);
      url.searchParams.set('after', after);
    }

    function safeMedia(media) {
      const output = {};

      for (const key of [
        'id',
        'media_type',
        'media_url',
        'permalink',
        'thumbnail_url',
        'timestamp'
      ]) {
        if (
          typeof media?.[key] === 'string' &&
          !media[key].includes(token)
        ) {
          output[key] = media[key];
        }
      }

      if (Array.isArray(media?.children?.data)) {
        output.children = {
          data: media.children.data.map(safeMedia)
        };
      }

      return output;
    }

    const uniquePosts = [
      ...new Map(posts.map(post => [post.id, post])).values()
    ];

    return res.status(200).json({
      data: uniquePosts.map(safeMedia),
      has_more: false
    });

  } catch (error) {
    console.error('Instagram transport error:', error.name);

    return res.status(502).json({
      error: 'Instagram API network request failed.'
    });
  }
};
