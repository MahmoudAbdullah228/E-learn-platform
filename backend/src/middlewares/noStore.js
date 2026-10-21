export function noStore(req, res, next) {
  void req;
  res.set('Cache-Control', 'no-store');
  next();
}
