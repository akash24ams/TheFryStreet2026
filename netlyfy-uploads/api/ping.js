
module.exports = function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
        success: true,
        message: 'The Fry Street API is working'
    });
};
