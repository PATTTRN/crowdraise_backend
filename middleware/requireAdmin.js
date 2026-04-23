/**
 * Authorization middleware: only allow users with admin role.
 * Must be used after the `authenticate` middleware so that req.user is set.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden. Admins only.' });
  }
  next();
}

module.exports = requireAdmin;
