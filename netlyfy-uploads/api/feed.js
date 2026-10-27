
const instagramHandler = require('./instagram.js');

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    return instagramHandler(req, res);
};
