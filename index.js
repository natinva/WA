// index.js
// Node 20+ (fetch is built-in). Install deps: `npm i express`
// Start with: `npm start`

import express from "express";

const app = express();
app.use(express.json());

// ---- ENV ----
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;        // Meta WhatsApp Cloud API token
const PHONE_ID     = process.env.PHONE_NUMBER_ID;     // e.g. "123456789012345"
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;        // any string you chose
const OPENAI_KEY   = process.env.OPENAI_API_KEY || ""; // optional

function okEnv() {
  if (!ACCESS_TOKEN || !PHONE_ID || !VERIFY_TOKEN) {
    console.error("Missing required env vars. ACCESS_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN are mandatory.");
    return false;
  }
  return true;
}

// ---- HEALTH CHECK ----
app.get("/", (_req, res) => res.status(200).send("OK"));

// ---- WEBHOOK VERIFY (GET) ----
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---- INBOUND HANDLER (POST) ----
app.post("/webhook", async (req, res) => {
  // Log the entire payload so you can see what Meta posts
  console.log("INBOUND:", JSON.stringify(req.body, null, 2));

  // Acknowledge immediately (Meta requires a quick 200)
  // We'll still await reply sending, but keep logic lightweight.
  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        const messages = value?.messages || [];
        for (const msg of messages) {
          await handleMessage(value, msg);
        }
      }
    }
  } catch (e) {
    console.error("Webhook handling error:", e);
  }

  return res.sendStatus(200);
});

// ---- MESSAGE ROUTER ----
async function handleMessage(value, message) {
  if (!okEnv()) return;

  const from = message.from;               // e.g. "9053xxxxxxxx" (E.164 without +)
  const type = message.type;               // "text", "interactive", "image", etc.
  const profileName = value?.contacts?.[0]?.profile?.name || "";

  // Extract user input depending on message type
  let userText = "";
  let buttonId = "";
  if (type === "text") {
    userText = message.text?.body || "";
  } else if (type === "interactive") {
    // Button or list replies
    const br = message.interactive?.button_reply;
    const lr = message.interactive?.list_reply;
    if (br) {
      buttonId = br.id || "";
      userText = br.title || "";
    } else if (lr) {
      buttonId = lr.id || "";
      userText = lr.title || "";
    }
  } else {
    userText = `[${type} received]`;
  }

  // Simple routing for interactive quick actions
  if (buttonId) {
    switch (buttonId) {
      case "buy_labreview":
        return sendText(from, "Satın alma bağlantısı: https://patientsum.com/pay/lab-review");
      case "book_consult":
        return sendText(from, "Randevu bağlantısı: https://patientsum.com/appointments");
      case "talk_agent":
        return sendText(from, "Bir temsilci birazdan bağlanacak. Lütfen bekleyin.");
      default:
        // Unknown button id
        return sendText(from, `Seçim alındı: ${userText}`);
    }
  }

  // Smart reply via OpenAI (optional)
  const reply = await smartReply(profileName, userText);
  await sendText(from, reply);

  // Optionally send interactive buttons after first response
  // await sendQuickActions(from);
}

// ---- OPENAI REPLY (Optional) ----
async function smartReply(name, text) {
  if (!text) return "Mesajınızı aldım.";
  if (!OPENAI_KEY) return `Aldım: ${text}`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful WhatsApp assistant for Patientsum. If the user's text appears Turkish, respond in Turkish; otherwise respond in English. Be brief and clear." },
          { role: "user", content: text }
        ]
      })
    });
    const data = await r.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    return out || "Sorry, I couldn't generate a reply.";
  } catch (e) {
    console.error("OpenAI error:", e);
    return `Aldım: ${text}`;
  }
}

// ---- SEND HELPERS ----
async function sendText(to, body) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("SendText error:", r.status, t);
  }
}

async function sendQuickActions(to) {
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Nasıl yardımcı olalım?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "buy_labreview", title: "Satın Al" } },
          { type: "reply", reply: { id: "book_consult", title: "Randevu Al" } },
          { type: "reply", reply: { id: "talk_agent", title: "Canlı Destek" } }
        ]
      }
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("SendQuickActions error:", r.status, t);
  }
}

async function sendTemplate(to, name, langCode = "tr", parameters = []) {
  // parameters = array of {type:"text", text:"..."} etc.
  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: langCode },
      ...(parameters.length
        ? { components: [{ type: "body", parameters }] }
        : {})
    }
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("SendTemplate error:", r.status, t);
  }
}

// ---- START ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Webhook up on port", PORT);
  if (!okEnv()) {
    console.log("Set required env vars in your Render service → Environment.");
  }
});
