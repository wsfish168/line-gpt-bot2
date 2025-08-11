const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// 載入 FAQ
let faqData = [];
try {
  faqData = JSON.parse(fs.readFileSync('faq.json', 'utf8'));
} catch (err) {
  console.error('❌ 無法讀取 faq.json：', err);
}

// 建立 LINE Client
const client = new line.Client(config);

// Webhook 路由
app.post('/webhook', line.middleware(config), async (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(result => res.json(result))
    .catch(err => {
      console.error('❌ Webhook 錯誤：', err);
      res.status(500).end();
    });
});

// 處理事件
async function handleEvent(event) {
  // 只處理訊息事件
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userMessage = event.message.text.trim();

  // 新好友加入（歡迎訊息）
  if (event.source.type === 'user' && userMessage === '') {
    const profile = await client.getProfile(event.source.userId);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `嗨 ${profile.displayName} 👋 歡迎加入我們！有關稅務、公司登記的問題都可以問我喔 📄💡`
    });
  }

  // FAQ 模糊關鍵字比對
  const faqItem = faqData.find(item => userMessage.includes(item.question));
  if (faqItem) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: faqItem.answer
    });
  }

  // 呼叫 OpenAI ChatGPT
  try {
    const openaiRes = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '你是位親切的線上客服，具有專業的稅務諮詢能力，也擅長辦理公司行號相關的設立、變更登記，回答簡短明確，可以用一點emoji。'
          },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        }
      }
    );

    const replyText = openaiRes.data.choices[0].message.content.trim();
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText
    });

  } catch (error) {
    console.error('❌ OpenAI API 錯誤：', error.response?.data || error.message);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '抱歉，目前服務繁忙，請稍後再試 ⏳'
    });
  }
}

// 防 Render 免費版休眠的 GET /
app.get('/', (req, res) => {
  res.send('✅ LINE ChatGPT bot is running');
});

// 啟動伺服器
app.listen(process.env.PORT || 3000, () => {
  console.log('🚀 Server is running');
});
