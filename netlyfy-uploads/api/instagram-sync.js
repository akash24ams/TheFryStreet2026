
const { syncInstagram } = require('../lib/instagram-store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const expected = process.env.CRON_SECRET;

  if (
    !expected ||
    req.headers.authorization !== `Bearer ${expected}`
  ) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  try {
    const result = await syncInstagram();

    return res.status(200).json({
      ok: true,
      ...result
    });

  } catch (error) {
    console.error(
      'Instagram sync failed:',
      error.message
    );

    return res.status(503).json({
      ok: false,
      error: 'Sync failed; existing backup remains unchanged'
    });
  }
};
