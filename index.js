import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import { Client, middleware } from "@line/bot-sdk";
import dotenv from "dotenv";

dotenv.config();

// LINE 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(config);

const app = express();
app.use(middleware(config));
app.use(express.json());

// 載入 FAQ
let faqData = [];
try {
  const faqRaw = fs.readFileSync("./faq.json");
  faqData = JSON.parse(faqRaw);
} catch (error) {
  console.error("❌ 無法讀取 faq.json：", error);
}

// 處理事件
app.post("/webhook", (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  // 只處理文字訊息與 follow 事件
  if (event.type === "follow") {
    const profile = await client.getProfile(event.source.userId);
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `哈囉 ${profile.displayName} 👋 歡迎加入！\n我是您的稅務與公司登記小幫手 📝`,
    });
  }

  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text.trim();

  // FAQ 模糊比對
  for (let faq of faqData) {
    if (userMessage.includes(faq.question)) {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: faq.answer,
      });
    }
  }

  // 若找不到 FAQ 匹配，回覆預設訊息
  return client.replyMessage(event.replyToken, {
    type: "text",
    text: "抱歉，我目前無法理解您的問題，您可以輸入更明確的關鍵字或聯繫客服 🛠",
  });
}

// Render 免費版防睡眠 Ping
setInterval(() => {
  fetch("https://你的-render-網址.onrender.com").then(() =>
    console.log("✅ 自動喚醒 Ping 成功")
  );
}, 14 * 60 * 1000); // 每 14 分鐘 ping 一次

app.get("/", (req, res) => res.send("Bot is running"));

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 LINE bot 已啟動");
});
