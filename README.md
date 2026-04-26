# Tatua Gateway

M-Pesa payment middleware. Receives all payments from Safaricom and routes them to registered businesses.

## Setup

```bash
cp .env.example .env
# Fill in your Daraja credentials and public URL
npm install
npm run dev
```

## Environment Variables

| Variable               | Description                                        |
|------------------------|----------------------------------------------------|
| `PORT`                 | Server port (default 3000)                         |
| `DARAJA_CONSUMER_KEY`  | Your Daraja consumer key                           |
| `DARAJA_CONSUMER_SECRET` | Your Daraja consumer secret                      |
| `DARAJA_ENVIRONMENT`   | `sandbox` or `production`                          |
| `GATEWAY_BASE_URL`     | Public HTTPS URL (e.g. https://gateway.tatua.co.ke)|
| `ADMIN_SECRET`         | Secret for admin endpoints                         |

## API Endpoints

### Safaricom Callbacks (called by Safaricom)
```
POST /daraja/confirmation   ← payment received
POST /daraja/validation     ← payment about to happen
```

### Business API (called by SDK)
```
GET  /api/me                        — business profile
GET  /api/transactions              — list transactions
GET  /api/transactions/:transId     — single transaction
```
All require `X-Tatua-Key: tatua_xxx` header.

### Admin (internal use)
```
POST /admin/businesses       — register a new business
GET  /admin/businesses       — list all businesses
POST /admin/register-c2b     — register C2B URLs with Safaricom
```
All require `X-Admin-Secret: your_admin_secret` header.

## Onboarding a Business

### 1. Register the business
```bash
curl -X POST http://localhost:3000/admin/businesses \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your_admin_secret" \
  -d '{
    "name": "Mama Mboga Shop",
    "shortcode": "123456",
    "shortcodeType": "till",
    "webhookUrl": "https://mamamboga.com/payments/webhook"
  }'
```

Response:
```json
{
  "message": "Business registered successfully",
  "business": {
    "id": "uuid",
    "name": "Mama Mboga Shop",
    "shortcode": "123456",
    "shortcodeType": "till",
    "apiKey": "tatua_abc123...",
    "webhookUrl": "https://mamamboga.com/payments/webhook"
  }
}
```

### 2. Register C2B URLs with Safaricom (once per shortcode)
```bash
curl -X POST http://localhost:3000/admin/register-c2b \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your_admin_secret" \
  -d '{ "shortcode": "123456" }'
```

### 3. Give the business their API key
They install the Tatua SDK and use the `apiKey` returned in step 1.

## Deployment (Render)

1. Push to GitHub
2. Create new Web Service on Render
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Set all environment variables
6. Use the Render URL as `GATEWAY_BASE_URL`
