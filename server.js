require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// SumUp credentials
const SUMUP_API_KEY = process.env.SUMUP_API_KEY;
const SUMUP_CLIENT_ID = process.env.SUMUP_CLIENT_ID;
const SUMUP_BASE_URL = 'https://api.sumup.com/v0.1';

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'Shopify-SumUp integration is running',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Test SumUp connection
app.get('/test-sumup', async (req, res) => {
  try {
    const response = await axios.get(`${SUMUP_BASE_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${SUMUP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      status: 'success',
      message: 'SumUp connection successful',
      merchant: response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      details: error.response?.data
    });
  }
});

// Webhook endpoint for Shopify orders
app.post('/webhook/order-created', async (req, res) => {
  try {
    const order = req.body;
    
    console.log('Received order from Shopify:', order.id);
    
    // Verify webhook (in production you should verify the HMAC)
    if (!order.id) {
      return res.status(400).json({ error: 'Invalid order data' });
    }

    // Create checkout in SumUp
    const checkoutData = {
      checkout_reference: `shopify-${order.id}`,
      amount: parseFloat(order.total_price),
      currency: order.currency,
      merchant_code: SUMUP_CLIENT_ID,
      description: `Shopify Order #${order.order_number}`,
      return_url: order.order_status_url
    };

    const sumupResponse = await axios.post(
      `${SUMUP_BASE_URL}/checkouts`,
      checkoutData,
      {
        headers: {
          'Authorization': `Bearer ${SUMUP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('SumUp checkout created:', sumupResponse.data);

    res.json({
      status: 'success',
      shopify_order: order.id,
      sumup_checkout: sumupResponse.data
    });

  } catch (error) {
    console.error('Error processing order:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      details: error.response?.data
    });
  }
});

// Get SumUp transactions
app.get('/transactions', async (req, res) => {
  try {
    const response = await axios.get(`${SUMUP_BASE_URL}/me/transactions`, {
      headers: {
        'Authorization': `Bearer ${SUMUP_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      status: 'success',
      transactions: response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`SumUp API configured: ${SUMUP_API_KEY ? 'Yes' : 'No'}`);
});
