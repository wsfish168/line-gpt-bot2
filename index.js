import express from "express";
import { middleware, Client } from "@line/bot-sdk";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";

dotenv.config();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();
const port = process.env.PORT || 3000;

// 讀取 FAQ
let faq = [];
try {
  faq = JSON.parse(fs.readFileSync("./faq.json", "utf8"));
} catch (error) {
  console.error("❌ 讀取 FAQ 失敗：", error);
}

// OpenAI 初始化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Webhook 路由
app.post(
  "/webhook",
  (req, res, next) => {
    if (!req.headers["x-line-signature"]) {
      console.warn("⚠️ Webhook 請求沒有簽章");
      return res.status(200).send("No signature, ignored");
    }
    next();
  },
  middleware(config),
  async (req, res) => {
    try {
      const events = req.body.events;
      await Promise.all(events.map(handleEvent));
      res.status(200).end();
    } catch (error) {
      console.error("❌ 處理 Webhook 錯誤：", error);
      res.status(200).end();
    }
  }
);

// 處理事件
async function handleEvent(event) {
  // 歡迎訊息（依使用者名稱客製化）
  if (event.type === "follow") {
    try {
      const profile = await client.getProfile(event.source.userId);
      const welcomeMsg = `嗨 ${profile.displayName} 😊 歡迎加入！我是文山智能客服，請問有什麼問題呢？`;
      return client.replyMessage(event.replyToken, { type: "text", text: welcomeMsg });
    } catch (error) {
      console.error("❌ 無法取得使用者名稱：", error);
      return client.replyMessage(event.replyToken, { type: "text", text: "您好~歡迎加入！我是文山智能客服~請問有什麼問題呢？" });
    }
  }

  // 只處理文字訊息
  if (event.type !== "message" || event.message.type !== "text") return;
  const userMessage = event.message.text.trim();

  // FAQ 關鍵字匹配
  const matchedFAQ = faq.find(item =>
    item.keywords.some(keyword => userMessage.includes(keyword))
  );

  if (matchedFAQ) {
    return client.replyMessage(event.replyToken, { type: "text", text: matchedFAQ.reply });
  }

  // OpenAI 回覆（gpt-3.5-turbo）
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "你是位親切的線上客服，具有專業的稅務諮詢能力，也擅長辦理公司行號相關的設立、變更登記，回答簡短明確，可以用一點emoji",
        },
        { role: "user", content: userMessage },
      ],
    });

    const aiReply = completion.choices[0].message.content.trim();
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: aiReply || "抱歉，目前無法提供回覆。",
    });
  } catch (error) {
    console.error("❌ OpenAI 回覆失敗：", error);
    return client.replyMessage(event.replyToken, { type: "text", text: "抱歉，目前系統忙碌，請稍後再試。" });
  }
}

// 健康檢查（給 UptimeRobot 用）
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
