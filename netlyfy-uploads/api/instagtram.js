
 // Vercel Node.js Function
 // Instagram Feed API

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({
            error: 'Method not allowed'
        });
    }

    // ========================================
    // STEP 1: LOCAL TESTING INSTAGRAM TOKEN
    // ========================================
    // Testing ke liye apna Instagram token
    // neeche quotes ke andar paste karein.
    //
    // Production deploy ya GitHub push karne
    // se pehle token yahan se remove kar dein.

    // const LOCAL_TEST_ACCESS_TOKEN = 'IGAAkSSNzNbnFBZAGJ0MnpxOWVLWDdRTmItUk5WRGxuQ1BBelBoY3JTNnFhQS1vZAFJGUEhGOVRUZAUc3akR1RHFHbDV0MTlYOGhvaGItY01VSUFOVDFHajI0ZAGdPZAUp5RHhuOXNvQVJvcm8zRGlKbEhsWUN6bkxhcWZAQcjdfTW1VawZDZD';

    // ========================================
    // STEP 2: VERCEL ENV TOKEN
    // ========================================
    // Vercel par INSTAGRAM_ACCESS_TOKEN
    // automatically use hoga.

    const token = (
        process.env.INSTAGRAM_ACCESS_TOKEN ||
       ''
    ).trim();

    if (!token) {
        return res.status(503).json({
            error: 'Instagram token missing. Set INSTAGRAM_ACCESS_TOKEN or LOCAL_TEST_ACCESS_TOKEN.'
        });
    }

    // ========================================
    // STEP 3: INSTAGRAM GRAPH API
    // ========================================

    const url = new URL(
        'https://graph.instagram.com/me/media'
    );

    url.searchParams.set(
        'fields',
        'id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,username,children{id,media_type,media_url,thumbnail_url}'
    );

    url.searchParams.set('limit', '100');
    url.searchParams.set('access_token', token);

    try {
        const posts = [];
        let hasMore = false;
        const seenCursors = new Set();

        const signal = AbortSignal.timeout(20000);

        // Maximum 3 pages (up to 300 posts)
        for (let page = 0; page < 3; page++) {
            const response = await fetch(url, { signal });
            const result = await response.json();

            if (!response.ok || result.error) {
                console.warn('Instagram API failed', {
                    status: response.status,
                    code: result.error?.code,
                    subcode: result.error?.error_subcode
                });

                return res.status(502).json({
                    error: 'Instagram API failed. Check token validity and permissions.',
                    code: result.error?.code || null,
                    subcode: result.error?.error_subcode || null
                });
            }

            if (!Array.isArray(result.data)) {
                return res.status(502).json({
                    error: 'Unexpected Instagram API response.'
                });
            }

            posts.push(...result.data);

            const after = result.paging?.cursors?.after;

            hasMore = Boolean(
                result.paging?.next &&
                typeof after === 'string' &&
                after
            );

            if (!hasMore || seenCursors.has(after)) {
                break;
            }

            seenCursors.add(after);
            url.searchParams.set('after', after);
        }

        // ========================================
        // STEP 4: CLEAN INSTAGRAM RESPONSE
        // ========================================

        const keys = [
            'id',
            'caption',
            'media_type',
            'media_product_type',
            'media_url',
            'permalink',
            'thumbnail_url',
            'timestamp',
            'username'
        ];

        function clean(post) {
            const item = {};

            for (const key of keys) {
                if (
                    typeof post?.[key] === 'string' &&
                    !post[key].includes(token)
                ) {
                    item[key] = post[key];
                }
            }

            if (Array.isArray(post?.children?.data)) {
                item.children = {
                    data: post.children.data.map(clean)
                };
            }

            return item;
        }

        // Remove duplicate posts
        const uniquePosts = Array.from(
            new Map(
                posts.map(post => [post.id, post])
            ).values()
        );

        // ========================================
        // STEP 5: SEND POSTS TO FRONTEND
        // ========================================

        return res.status(200).json({
            data: uniquePosts.map(clean),
            has_more: hasMore
        });

    } catch (error) {
        console.error('Instagram fetch error:', error.message);

        return res.status(502).json({
            error: 'Instagram did not respond. Please try again later.'
        });
    }
};
