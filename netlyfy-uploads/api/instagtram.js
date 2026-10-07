module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({
            error: { message: "Method not allowed." }
        });
    }

    const token = process.env.instagram_access_key;

    if (!token) {
        return res.status(503).json({
            error: {
                message: "Instagram access key is not configured."
            }
        });
    }

    const fields = [
        "id",
        "caption",
        "media_type",
        "media_product_type",
        "media_url",
        "permalink",
        "thumbnail_url",
        "timestamp",
        "username",
        "children{id,media_type,media_url,thumbnail_url}"
    ].join(",");

    const url = new URL(
        "https://graph.instagram.com/me/media"
    );

    url.searchParams.set("fields", fields);
    url.searchParams.set("limit", "30");
    url.searchParams.set("access_token", token);

    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(10000)
        });

        const result = await response.json();

        if (
            !response.ok ||
            result.error ||
            !Array.isArray(result.data)
        ) {
            return res.status(502).json({
                error: {
                    message: "Instagram feed is temporarily unavailable."
                }
            });
        }

        res.setHeader(
            "Cache-Control",
            "public, s-maxage=300, stale-while-revalidate=600"
        );

        // Only return posts. Pagination URLs can contain the token.
        return res.status(200).json({
            data: result.data
        });
    } catch (error) {
        return res.status(502).json({
            error: {
                message: "Instagram feed is temporarily unavailable."
            }
        });
    }
};
