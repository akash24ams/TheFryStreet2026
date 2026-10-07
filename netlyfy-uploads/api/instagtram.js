export default async function handler(req, res) {

    if (req.method !== 'GET') {

        res.setHeader(
            'Allow',
            'GET'
        );

        return res
            .status(405)
            .json({
                error:
                    'Method not allowed'
            });
    }

    const token =
        process.env
            .INSTAGRAM_ACCESS_TOKEN;

    if (!token) {

        return res
            .status(500)
            .json({
                error:
                    'Instagram access token is not configured on the server'
            });
    }

    const fields = [
        'id',
        'caption',
        'media_type',
        'media_product_type',
        'media_url',
        'permalink',
        'thumbnail_url',
        'timestamp',
        'username',
        'children{id,media_type,media_url,thumbnail_url}'
    ].join(',');

    const firstPageUrl =
        'https://graph.instagram.com/me/media'
        + '?fields='
        + encodeURIComponent(fields)

        + '&limit=100'

        + '&access_token='
        + encodeURIComponent(token);

    try {

        const allPosts = [];

        let nextUrl =
            firstPageUrl;

        let pageCount = 0;

        while (
            nextUrl &&
            pageCount < 20
        ) {

            const response =
                await fetch(
                    nextUrl,
                    {
                        headers: {
                            Accept:
                                'application/json'
                        }
                    }
                );

            const result =
                await response
                    .json()
                    .catch(
                        () => ({})
                    );

            if (
                !response.ok ||
                result.error
            ) {

                console.error(
                    'Instagram API error:',
                    result
                        ?.error
                        ?.message ||
                    response.status
                );

                return res
                    .status(502)
                    .json({
                        error:
                            'Instagram feed could not be loaded'
                    });
            }

            if (
                Array.isArray(
                    result.data
                )
            ) {

                allPosts.push(
                    ...result.data
                );
            }

            nextUrl =
                result
                    ?.paging
                    ?.next &&
                typeof result.paging.next
                    === 'string'

                    ? result.paging.next
                    : '';

            pageCount++;
        }

        res.setHeader(
            'Cache-Control',
            'public, s-maxage=300, stale-while-revalidate=600'
        );

        return res
            .status(200)
            .json({
                data:
                    allPosts
            });

    } catch (error) {

        console.error(
            'Instagram function error:',
            error
        );

        return res
            .status(500)
            .json({
                error:
                    'Instagram feed is temporarily unavailable'
            });
    }
}
