// Simple Modular Server Test

const express = require('express');
const http = require('http');
const path = require('path');

console.log('Starting simple server...');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Import and use auth routes
try {
  console.log('Loading auth routes...');
  const authRoutes = require('./src/server/routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('Auth routes loaded successfully');
} catch (error) {
  console.error('Failed to load auth routes:', error.message);
}

// Start server
server.listen(PORT, () => {
  console.log(`Simple server running on port ${PORT}`);
});

console.log('Server setup complete');