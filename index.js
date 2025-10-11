import express from "express";

const app = express();
app.use(express.json());

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;        // Meta WhatsApp Cloud API token
const PHONE_ID     = process.env.PHONE_NUMBER_ID;     // e.g., 123456789012345
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;        // any string you choose

// Health check
app.get("/", (_req, res) => res.status(200).send("OK"));

// Webhook verification (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Incoming messages (POST)
app.post("/webhook", async (req, res) => {
  try {
    const change = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return res.sendStatus(200); // no user message

    const from = message.from; // user's WhatsApp ID (E.164 without + for Cloud API)
    const type = message.type;

    let userText = "";
    if (type === "text") userText = message.text?.body || "";
    else if (type === "interactive") {
      userText = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "";
    } else {
      userText = `[${type} received]`;
    }

    // --- BASIC REPLY LOGIC ---
    const reply = await smartReply(userText);

    // Send back via Cloud API
    await sendText(from, reply);

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

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
    console.error("Send error:", r.status, t);
  }
}

// Optional: call OpenAI if API key present, else simple echo
async function smartReply(text) {
  if (!process.env.OPENAI_API_KEY) {
    return `Aldım: ${text}`;
  }
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful WhatsApp assistant for Patientsum. Reply briefly and clearly. If user writes Turkish, respond in Turkish; otherwise respond in English." },
          { role: "user", content: text }
        ]
      })
    });
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim() || "Sorry, I couldn't generate a reply.";
  } catch (e) {
    console.error("OpenAI error:", e);
    return `Aldım: ${text}`;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Webhook up on port", PORT));
