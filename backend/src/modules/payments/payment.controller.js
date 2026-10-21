export function createPaymentController({ inbox }) {
  return Object.freeze({
    async webhook(req, res) {
      await inbox.receive({ rawBody: req.body, signature: req.get('stripe-signature') });
      res.set('Cache-Control', 'no-store').status(200).json({ data: { received: true } });
    },
  });
}
