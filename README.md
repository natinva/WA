# WhatsApp Cloud API Webhook (Render Starter)

This is a minimal Node/Express webhook ready to deploy on **Render** for WhatsApp Cloud API.

## 1) Local run (optional)
```bash
npm install
PORT=3000 node index.js
```

## 2) Environment variables
Create the following env vars on Render (or a local .env file via your own process manager):
- `ACCESS_TOKEN` (Meta WhatsApp Cloud API access token)
- `PHONE_NUMBER_ID` (from the WhatsApp product "Getting Started" page)
- `VERIFY_TOKEN` (any secret string; paste the same in Meta's Webhook form)
- `OPENAI_API_KEY` (optional for AI replies)

## 3) Deploy on Render
- Create a **New → Web Service**
- Connect your repo
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- Region: pick EU if your users are near Türkiye
- Plan: Free is okay for testing (can sleep). For production, use **Starter** to keep it always on.

Render will give you a URL like:
```
https://<service-name>.onrender.com
```

## 4) Set WhatsApp Webhook
In **Meta App Dashboard → WhatsApp → Webhooks**:
- **Callback URL**: `https://<service-name>.onrender.com/webhook`
- **Verify Token**: the exact `VERIFY_TOKEN` you set
- Subscribe to message events.

## 5) Test
Send a message to your WhatsApp test number.
You should get a reply "Aldım: <your text>",
or a smart reply if `OPENAI_API_KEY` is set.
