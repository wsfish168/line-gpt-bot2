import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import { Configuration, OpenAIApi } from 'openai';
import pkg from '@line/bot-sdk';

dotenv.config();

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new pkg.Client(config);
const app = express();

// 讀取 FAQ
let faqData = [];
try {
  const faqRaw = fs.readFileSync('./faq.json', 'utf8');
  faqData = JSON.parse(faqRaw);
  console.log('✅ FAQ 載入完成，共', faqData.length, '條');
} catch (err) {
  console.error('❌ FAQ 載入失敗：', err);
}

// OpenAI 設定
const openai = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY
  })
);

// Middleware
app.post('/webhook', pkg.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error('❌ Webhook 處理錯誤：', err);
    res.status(500).end();
  }
});

// 處理 LINE 訊息
async function handleEvent(event) {
  if (event.type === 'follow') {
    // 歡迎詞（客製化）
    const profile = await client.getProfile(event.source.userId);
    const welcomeMsg = `嗨 ${profile.displayName}，歡迎加入！我是您的智能客服 🤖\n可以問我稅務、公司設立、變更登記等問題喔 📄`;
    return client.replyMessage(event.replyToken, { type: 'text', text: welcomeMsg });
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userMsg = event.message.text.trim();

  // FAQ 第一層：完全匹配
  for (const faq of faqData) {
    if (faq.keywords.some(keyword => userMsg.includes(keyword))) {
      console.log(`📌 回覆路徑：完全匹配 → ${faq.keywords}`);
      return client.replyMessage(event.replyToken, { type: 'text', text: faq.reply });
    }
  }

  // FAQ 第二層：模糊匹配（計分）
  let bestMatch = null;
  let highestScore = 0;
  for (const faq of faqData) {
    let score = 0;
    faq.keywords.forEach(keyword => {
      if (userMsg.includes(keyword)) score++;
    });
    if (score > highestScore) {
      highestScore = score;
      bestMatch = faq;
    }
  }

  if (bestMatch && highestScore > 0) {
    console.log(`📌 回覆路徑：模糊匹配（分數 ${highestScore}）→ ${bestMatch.keywords}`);
    return client.replyMessage(event.replyToken, { type: 'text', text: bestMatch.reply });
  }

  // 第三層：GPT 回覆
  console.log(`📌 回覆路徑：GPT 回覆（未匹配 FAQ）`);
  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            '你是位親切的線上客服，具有專業的稅務諮詢能力，也擅長辦理公司行號相關的設立、變更登記，回答簡短明確，可以用一點emoji。'
        },
        { role: 'user', content: userMsg }
      ]
    });

    const gptReply = completion.data.choices[0].message.content.trim();
    return client.replyMessage(event.replyToken, { type: 'text', text: gptReply });
  } catch (err) {
    console.error('❌ GPT 回覆錯誤：', err);
    return client.replyMessage(event.replyToken, { type: 'text', text: '抱歉，我暫時無法回答您的問題 🙏' });
  }
}

// Render 保活用
app.get('/', (req, res) => {
  res.send('Bot is running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server is running on port ${port}`);
});
