
const {
  refreshInstagramToken
} = require('../lib/instagram-token');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const secret = process.env.CRON_SECRET;

  if (
    !secret ||
    req.headers.authorization !== `Bearer ${secret}`
  ) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  try {
    const result = await refreshInstagramToken();

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error(
      'Instagram refresh failed:',
      error.message
    );

    return res.status(503).json({
      success: false,
      error: 'Instagram token refresh failed'
    });
  }
};
