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

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'Shopify-SumUp integration is running',
    timestamp: new Date().toISOString()
  });
});

// Health check
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
      message: error.response?.data || error.message
    });
  }
});

// Webhook endpoint voor Shopify orders
app.post('/webhook/order-created', async (req, res) => {
  try {
    const order = req.body;
    
    console.log('Order ontvangen:', order.id);
    
    // Verifieer Shopify webhook (optioneel maar aanbevolen)
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    
    console.log('Shop domain:', shopDomain);
    
    // Maak checkout in SumUp
    const checkoutData = {
      checkout_reference: `shopify-${order.id}`,
      amount: parseFloat(order.total_price),
      currency: order.currency,
      merchant_code: SUMUP_CLIENT_ID,
      description: `Shopify Order #${order.order_number}`,
      return_url: `https://${shopDomain}/orders/${order.id}`
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
    
    console.log('SumUp checkout aangemaakt:', sumupResponse.data);
    
    // Respond to Shopify
    res.status(200).json({
      status: 'success',
      checkout_id: sumupResponse.data.id,
      checkout_url: sumupResponse.data.checkout_url
    });
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({
      status: 'error',
      message: error.response?.data || error.message
    });
  }
});

// Get checkout status
app.get('/checkout/:checkoutId', async (req, res) => {
  try {
    const { checkoutId } = req.params;
    
    const response = await axios.get(
      `${SUMUP_BASE_URL}/checkouts/${checkoutId}`,
      {
        headers: {
          'Authorization': `Bearer ${SUMUP_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.response?.data || error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server draait op poort ${PORT}`);
  console.log(`SumUp API Key: ${SUMUP_API_KEY ? 'Configured' : 'Missing'}`);
  console.log(`SumUp Client ID: ${SUMUP_CLIENT_ID ? 'Configured' : 'Missing'}`);
});
