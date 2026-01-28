const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const schemaSyncHandler = require('./server/api/schema-sync').default;

const app = express();
const port = process.env.PORT || 3333;

// Parse JSON bodies
app.use(express.json());

// API route for schema sync
app.post('/api/schema-sync', (req, res) => {
  schemaSyncHandler(req, res);
});

// Proxy all other requests to Sanity Studio
app.use(
  '/',
  createProxyMiddleware({
    target: 'http://localhost:3333',
    ws: true,
    onProxyReq: (proxyReq, req, res) => {
      // Need to handle POST, PUT, PATCH methods
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },
  })
);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 