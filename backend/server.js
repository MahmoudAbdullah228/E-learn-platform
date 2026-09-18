import 'dotenv/config';

import { app } from './src/app.js';

const port = Number(process.env.PORT ?? 5000);

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
