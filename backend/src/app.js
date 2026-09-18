import express from 'express';

export const app = express();

app.use(express.json());

app.get('/api/v1/health', (request, response) => {
  response.json({ status: 'ok' });
});

app.use((request, response) => {
  response.status(404).json({ message: 'Not found' });
});
