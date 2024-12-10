const express = require("express");
const serverless = require("serverless-http");
const app = express();

// Enable JSON parsing
app.use(express.json());

// Import your existing routes and middleware
const routes = require('../../server');

// Use your existing routes
app.use('/api/', routes);

// Export the serverless handler
module.exports.handler = serverless(app);
