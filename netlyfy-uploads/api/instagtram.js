export default async function handler(req, res) {
    try {
        const token = process.env.INSTAGRAM_ACCESS_TOKEN;

        if (!token) {
            return res.status(500).json({
                error: 'Instagram access token is not configured'
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

        const url =
            'https://graph.instagram.com/me/media'
            + '?fields=' + encodeURIComponent(fields)
            + '&limit=100'
            + '&access_token=' + encodeURIComponent(token);

        const response = await fetch(url);

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Instagram request failed'
            });
        }

        res.setHeader(
            'Cache-Control',
            's-maxage=60, stale-while-revalidate=300'
        );

        return res.status(200).json(data);

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: 'Unable to load Instagram feed'
        });
    }
}