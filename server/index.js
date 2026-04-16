const express = require('express');
const path = require('path');
const db = require('./db');
const nestsRouter = require('./routes/nests');
const tagsRouter = require('./routes/tags');
const ordersRouter = require('./routes/orders');
const statusChecker = require('./statusChecker');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/nests', nestsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/orders', ordersRouter);

// Start periodic status check every 5 minutes
statusChecker.start();

app.listen(PORT, () => {
  console.log(`Birdnest server running on http://0.0.0.0:${PORT}`);
});
