(function loadHomeInstagramFeed() {
    const feed =
        document.getElementById(
            'instagramLatestGrid'
        );

    const loadMoreRow =
        document.getElementById(
            'instagramLoadMoreRow'
        );

    const loadMoreBtn =
        document.getElementById(
            'instagramLoadMoreBtn'
        );

    if (
        !feed ||
        !loadMoreRow ||
        !loadMoreBtn
    ) {
        return;
    }

    const INSTAGRAM_API_URL =
        '/api/instagram';

    const AUTO_REFRESH_MS =
        10 * 60 * 1000;

    const INSTAGRAM_CACHE_KEY =
        'theFryStreetInstagramFeedV3';

    let allPosts = [];

    function esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function timestampMs(post) {
        if (
            !post ||
            !post.timestamp
        ) {
            return 0;
        }

        const value =
            Date.parse(
                post.timestamp
            );

        return Number.isFinite(value)
            ? value
            : 0;
    }

    function mediaPreview(post) {
        if (!post) return '';

        const type =
            String(
                post.media_type ||
                ''
            ).toUpperCase();

        if (
            type ===
            'CAROUSEL_ALBUM'
        ) {
            const children =
                post.children &&
                Array.isArray(
                    post.children.data
                )
                    ? post.children.data
                    : [];

            const first =
                children[0] || {};

            return (
                first.thumbnail_url ||
                first.media_url ||
                post.thumbnail_url ||
                post.media_url ||
                ''
            );
        }

        return (
            post.thumbnail_url ||
            post.media_url ||
            ''
        );
    }

    function normalizeAndSort(items) {
        const unique =
            new Map();

        (
            Array.isArray(items)
                ? items
                : []
        ).forEach(
            function (post) {
                if (
                    post &&
                    post.id
                ) {
                    unique.set(
                        post.id,
                        post
                    );
                }
            }
        );

        return Array
            .from(
                unique.values()
            )
            .filter(
                function (post) {
                    return !!(
                        post &&
                        post.id &&
                        mediaPreview(post)
                    );
                }
            )
            .sort(
                function (a, b) {
                    return (
                        timestampMs(b) -
                        timestampMs(a)
                    );
                }
            );
    }

    function cardHtml(post) {
        const type =
            String(
                post.media_type ||
                'IMAGE'
            ).toUpperCase();

        const productType =
            String(
                post.media_product_type ||
                ''
            ).toUpperCase();

        const url =
            esc(
                post.permalink ||
                'https://www.instagram.com/thefrystreet/'
            );

        const caption =
            esc(
                post.caption ||
                'The Fry Street Instagram post'
            );

        if (
            type === 'VIDEO'
        ) {
            const videoSrc =
                esc(
                    post.media_url ||
                    ''
                );

            const poster =
                esc(
                    post.thumbnail_url ||
                    ''
                );

            if (videoSrc) {
                return `
                    <a
                        class="ig-feed-card"
                        href="${url}"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="${caption}"
                    >
                        <video
                            src="${videoSrc}"
                            ${poster ? `poster="${poster}"` : ''}
                            autoplay
                            muted
                            loop
                            playsinline
                            preload="metadata"
                        ></video>

                        <span class="ig-feed-type">
                            ${
                                productType === 'REELS'
                                    ? 'REEL'
                                    : 'VIDEO'
                            }
                        </span>
                    </a>
                `;
            }
        }

        const imageSrc =
            esc(
                mediaPreview(post)
            );

        if (!imageSrc) {
            return '';
        }

        return `
            <a
                class="ig-feed-card"
                href="${url}"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="${caption}"
            >
                <img
                    src="${imageSrc}"
                    alt="${caption}"
                    loading="lazy"
                    decoding="async"
                >

                <span class="ig-feed-type">
                    ${
                        type ===
                        'CAROUSEL_ALBUM'
                            ? 'ALBUM'
                            : 'POST'
                    }
                </span>
            </a>
        `;
    }

    function renderVisible() {
        if (!allPosts.length) {
            feed.innerHTML = `
                <div class="ig-feed-status">
                    No Instagram posts are available right now.
                </div>
            `;

            loadMoreRow.style.display =
                'none';

            return;
        }

        const doubledPosts = [
            ...allPosts,
            ...allPosts
        ];

        feed.innerHTML = `
            <div class="ig-marquee-track">
                ${
                    doubledPosts
                        .map(cardHtml)
                        .join('')
                }
            </div>
        `;

        loadMoreRow.style.display =
            'none';
    }

    function saveInstagramCache(
        posts
    ) {
        try {
            localStorage.setItem(
                INSTAGRAM_CACHE_KEY,
                JSON.stringify({
                    savedAt:
                        Date.now(),

                    posts:
                        posts
                })
            );

        } catch (error) {
        }
    }

    function loadInstagramCache() {
        try {
            const raw =
                localStorage.getItem(
                    INSTAGRAM_CACHE_KEY
                );

            if (!raw) {
                return false;
            }

            const cached =
                JSON.parse(raw);

            if (
                !cached ||
                !Array.isArray(
                    cached.posts
                ) ||
                !cached.posts.length
            ) {
                return false;
            }

            allPosts =
                normalizeAndSort(
                    cached.posts
                );

            renderVisible();

            return true;

        } catch (error) {
            return false;
        }
    }

    async function fetchInstagramPosts() {
        const response =
            await fetch(
                INSTAGRAM_API_URL,
                {
                    method:
                        'GET',

                    headers: {
                        Accept:
                            'application/json'
                    },

                    cache:
                        'no-store'
                }
            );

        const result =
            await response
                .json()
                .catch(
                    function () {
                        return {};
                    }
                );

        if (
            !response.ok
        ) {
            throw new Error(
                result.error ||
                'Instagram feed request failed'
            );
        }

        return Array.isArray(
            result.data
        )
            ? result.data
            : [];
    }

    async function refreshFeed() {
        try {
            const posts =
                await fetchInstagramPosts();

            allPosts =
                normalizeAndSort(
                    posts
                );

            if (
                allPosts.length
            ) {
                saveInstagramCache(
                    allPosts
                );
            }

            renderVisible();

        } catch (error) {
            console.error(
                'Instagram feed error:',
                error
            );

            if (
                !allPosts.length
            ) {
                feed.innerHTML = `
                    <div class="ig-feed-status">

                        Instagram feed is temporarily unavailable.

                        <br><br>

                        <a
                            href="https://www.instagram.com/thefrystreet/"
                            target="_blank"
                            rel="noopener noreferrer"
                            style="color:#f5ca18;text-decoration:underline;"
                        >
                            View Instagram
                        </a>

                    </div>
                `;

                loadMoreRow.style.display =
                    'none';
            }
        }
    }

    feed.addEventListener(
        'pointerdown',
        function () {
            feed.classList.add(
                'is-user-paused'
            );
        }
    );

    window.addEventListener(
        'pointerup',
        function () {
            const hoveringCard =
                document.querySelector(
                    '#home-instagram-feed .ig-feed-card:hover'
                );

            if (
                !hoveringCard
            ) {
                feed.classList.remove(
                    'is-user-paused'
                );
            }
        }
    );

    feed.addEventListener(
        'mouseleave',
        function () {
            feed.classList.remove(
                'is-user-paused'
            );
        }
    );

    feed.addEventListener(
        'touchstart',
        function () {
            feed.classList.add(
                'is-user-paused'
            );
        },
        {
            passive: true
        }
    );

    feed.addEventListener(
        'touchend',
        function () {
            feed.classList.remove(
                'is-user-paused'
            );
        },
        {
            passive: true
        }
    );

    const hadCachedInstagramFeed =
        loadInstagramCache();

    if (
        !hadCachedInstagramFeed
    ) {
        feed.innerHTML = `
            <div class="ig-feed-status">
                Loading Instagram…
            </div>
        `;
    }

    refreshFeed();

    window.setInterval(
        function () {
            if (
                !document.hidden
            ) {
                refreshFeed();
            }
        },
        AUTO_REFRESH_MS
    );

})();
