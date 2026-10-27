
const { readSnapshot } = require('../lib/instagram-store');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: 'Storage not configured'
    });
  }

  try {
    const snapshot = await readSnapshot();

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=120, stale-while-revalidate=300'
    );

    if (!snapshot) {
      return res.status(200).json({
        data: [],
        message: 'No backup yet. Run the first secure sync.'
      });
    }

    return res.status(200).json({
      data: snapshot.data,
      savedAt: snapshot.savedAt,
      source: 'persistent-backup'
    });

  } catch (error) {
    console.error(
      'Saved Instagram feed unavailable:',
      error.message
    );

    return res.status(503).json({
      error: 'Saved feed temporarily unavailable'
    });
  }
};
