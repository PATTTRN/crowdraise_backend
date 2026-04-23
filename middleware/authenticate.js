/**
 * Authentication middleware: requires valid JWT, attaches user info to req.user
 */
var jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authentication token.' });
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_KEY, (err, decoded) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token.' });
    req.user = decoded;
    next();
  });
}

module.exports = authenticate;