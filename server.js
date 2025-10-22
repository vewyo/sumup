require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// SumUp credentials
const SUMUP_API_KEY = process.env.SUMUP_API_KEY;
const SUMUP_CLIENT_ID = process.env.SUMUP_CLIENT_ID;
const SUMUP_BASE_URL = 'https://api.sumup.com/v0.1';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// In-memory storage voor orders (in productie gebruik je een database)
const pendingOrders = new Map();

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'Shopify-SumUp Payment Gateway is running',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Test SumUp connection with detailed error info
app.get('/test-sumup', async (req, res) => {
  try {
    console.log('Testing SumUp with API Key:', SUMUP_API_KEY ? 'Present' : 'Missing');
    
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
    console.error('SumUp API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      headers: error.response?.headers
    });
    
    res.status(500).json({
      status: 'error',
      message: error.message,
      statusCode: error.response?.status,
      details: error.response?.data,
      hint: 'Check if your API key is valid and has the correct permissions'
    });
  }
});

// Get OAuth token (if you have client credentials)
app.get('/get-token', async (req, res) => {
  try {
    // This is for getting a new access token using client credentials
    const response = await axios.post('https://api.sumup.com/token', {
      grant_type: 'client_credentials',
      client_id: SUMUP_CLIENT_ID,
      client_secret: process.env.SUMUP_CLIENT_SECRET || ''
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    res.json({
      status: 'success',
      message: 'Token generated',
      token: response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      details: error.response?.data,
      hint: 'You might need a Client Secret for this'
    });
  }
});

// Checkout pagina - hier komt de klant naartoe vanaf Shopify
app.get('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url } = req.query;
  
  if (!amount || !currency) {
    return res.status(400).send('Missing required parameters: amount and currency');
  }

  // Add timestamp to make each attempt unique (only if order_id exists)
  const checkoutRef = order_id ? `shopify-${order_id}-${Date.now()}` : `shopify-${Date.now()}`;

  try {
    const checkoutData = {
      checkout_reference: checkoutRef,
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      pay_to_email: 'yurkovsergii@gmail.com',
      description: `Shopify Order ${order_id || ''}`
    };

    console.log('Creating SumUp checkout:', checkoutData);

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

    const checkout = sumupResponse.data;
    console.log('SumUp checkout created:', checkout.id);
    
    // Sla order info op
    if (order_id) {
      pendingOrders.set(checkout.id, {
        order_id,
        amount,
        currency,
        return_url,
        created_at: new Date()
      });
    }

    // Show payment page with SumUp Card Widget
    res.send(`
      <html>
        <head>
          <title>Betaling - €${amount}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script src="https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js"></script>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              background: #f5f5f5;
              padding: 20px;
              margin: 0;
            }
            .container {
              max-width: 500px;
              margin: 0 auto;
              background: white;
              border-radius: 10px;
              padding: 30px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
              text-align: center;
              color: #333;
              margin-bottom: 10px;
            }
            .amount {
              text-align: center;
              font-size: 48px;
              font-weight: bold;
              color: #000;
              margin: 20px 0;
            }
            .description {
              text-align: center;
              color: #666;
              margin-bottom: 30px;
            }
            #sumup-card {
              margin: 20px 0;
            }
            .secure {
              text-align: center;
              color: #999;
              font-size: 12px;
              margin-top: 20px;
            }
            .error {
              background: #ffebee;
              color: #c62828;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              display: none;
            }
            .success {
              background: #e8f5e9;
              color: #2e7d32;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              display: none;
            }
            .back-button {
              display: block;
              text-align: center;
              color: #666;
              text-decoration: none;
              margin-top: 20px;
              padding: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🛒 Afrekenen</h1>
            <div class="amount">€${amount}</div>
            <div class="description">Shopify Order ${order_id || ''}</div>
            
            <div id="error-message" class="error"></div>
            <div id="success-message" class="success"></div>
            
            <div id="sumup-card"></div>
            
            <div class="secure">
              🔒 Beveiligde betaling via SumUp
            </div>
            
            ${return_url ? `<a href="${return_url}" class="back-button">← Terug naar winkel</a>` : ''}
          </div>

          <script>
            SumUpCard.mount({
              checkoutId: '${checkout.id}',
              onResponse: function(type, body) {
                console.log('SumUp response:', type, body);
                
                const errorDiv = document.getElementById('error-message');
                const successDiv = document.getElementById('success-message');
                
                switch(type) {
                  case 'success':
                    successDiv.style.display = 'block';
                    successDiv.innerHTML = '✓ Betaling geslaagd! Je wordt doorgestuurd...';
                    setTimeout(() => {
                      window.location.href = '${return_url || APP_URL + '/payment/success'}?checkout_id=${checkout.id}';
                    }, 2000);
                    break;
                    
                  case 'error':
                    errorDiv.style.display = 'block';
                    errorDiv.innerHTML = '✗ Er ging iets mis: ' + (body.message || 'Probeer opnieuw');
                    break;
                    
                  case 'invalid':
                    errorDiv.style.display = 'block';
                    errorDiv.innerHTML = '✗ Ongeldige gegevens. Controleer je invoer.';
                    break;
                }
              }
            });
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error creating checkout:', error.message);
    console.error('Error status:', error.response?.status);
    console.error('Error details:', error.response?.data);
    
    res.status(500).send(`
      <html>
        <head><title>Payment Error</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>Er is een fout opgetreden</h1>
          <p>We konden de betaling niet starten. Probeer het opnieuw.</p>
          <p style="color: #666; font-size: 14px;">${error.message}</p>
          <p style="color: #999; font-size: 12px;">${JSON.stringify(error.response?.data || {})}</p>
          ${return_url ? `<a href="${return_url}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Terug naar winkel</a>` : ''}
        </body>
      </html>
    `);
  }
});

// Payment success pagina
app.get('/payment/success', (req, res) => {
  const { checkout_id } = req.query;
  
  res.send(`
    <html>
      <head>
        <title>Betaling Geslaagd</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .success-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .checkmark {
            color: #4CAF50;
            font-size: 60px;
          }
          h1 { color: #333; }
          p { color: #666; line-height: 1.6; }
          .button {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="success-box">
          <div class="checkmark">✓</div>
          <h1>Betaling Geslaagd!</h1>
          <p>Je betaling is succesvol verwerkt.</p>
          <p>Je ontvangt een bevestiging per e-mail.</p>
          ${checkout_id ? `<p style="font-size: 12px; color: #999;">Checkout ID: ${checkout_id}</p>` : ''}
          <a href="#" class="button" onclick="window.close()">Sluiten</a>
        </div>
      </body>
    </html>
  `);
});

// Payment failure pagina
app.get('/payment/failure', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Betaling Mislukt</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .error-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .cross {
            color: #f44336;
            font-size: 60px;
          }
          h1 { color: #333; }
          p { color: #666; line-height: 1.6; }
          .button {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background: #000;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="error-box">
          <div class="cross">✗</div>
          <h1>Betaling Mislukt</h1>
          <p>Je betaling kon niet worden verwerkt.</p>
          <p>Probeer het opnieuw of kies een andere betaalmethode.</p>
          <a href="#" class="button" onclick="window.history.back()">Opnieuw proberen</a>
        </div>
      </body>
    </html>
  `);
});

// Webhook endpoint for SumUp payment status
app.post('/webhook/sumup', async (req, res) => {
  try {
    const notification = req.body;
    console.log('SumUp webhook received:', notification);
    
    // Hier kan je de Shopify order updaten als de betaling is gelukt
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
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
  console.log(`Checkout URL: ${APP_URL}/checkout`);
});
