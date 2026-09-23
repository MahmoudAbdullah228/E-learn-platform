export function getHealth(request, response) {
  response.status(200).json({
    data: {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
}
