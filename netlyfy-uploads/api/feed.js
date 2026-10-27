
/*
 * THE FRY STREET — INSTAGRAM FEED
 * Vercel serverless function
 *
 * Required ENV:
 * INSTAGRAM_ACCESS_TOKEN
 *
 * Optional, for Facebook Login tokens:
 * INSTAGRAM_USER_ID
 */

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
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

    // Direct health test — no Instagram request
    const requestUrl = new URL(
        req.url || '/',
        'https://localhost'
    );

    if (requestUrl.searchParams.get('health') === '1') {
        return res.status(200).json({
            status: 'ok',
            function: 'feed',
            token_configured: Boolean(token),
            mode: userId ? 'facebook-login' : 'instagram-login'
        });
    }

    if (!token) {
        return res.status(503).json({
            error: 'INSTAGRAM_ACCESS_TOKEN missing in Vercel.'
        });
    }

    try {
        const endpoint = userId
            ? `https://graph.facebook.com/v24.0/${encodeURIComponent(userId)}/media`
            : 'https://graph.instagram.com/me/media';

        const url = new URL(endpoint);

        url.searchParams.set(
            'fields',
            'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}'
        );

        url.searchParams.set('limit', '50');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            },
            signal: AbortSignal.timeout(20000)
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.error) {
            console.error('Instagram API failed', {
                status: response.status,
                code: result.error?.code,
                subcode: result.error?.error_subcode
            });

            return res.status(502).json({
                error: 'Instagram API request failed',
                upstream_status: response.status,
                code: result.error?.code ?? null,
                subcode: result.error?.error_subcode ?? null
            });
        }

        if (!Array.isArray(result.data)) {
            return res.status(502).json({
                error: 'Instagram returned invalid media data.'
            });
        }

        function cleanMedia(media) {
            const cleaned = {};

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
                if (
                    typeof media?.[key] === 'string' &&
                    !media[key].includes(token)
                ) {
                    cleaned[key] = media[key];
                }
            }

            if (Array.isArray(media?.children?.data)) {
                cleaned.children = {
                    data: media.children.data.map(cleanMedia)
                };
            }

            return cleaned;
        }

        return res.status(200).json({
            data: result.data.map(cleanMedia),
            has_more: Boolean(result.paging?.next)
        });

    } catch (error) {
        console.error('Instagram feed error:', {
            name: error.name,
            message: error.message
        });

        return res.status(502).json({
            error: 'Unable to fetch Instagram posts.'
        });
    }
};
