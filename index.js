require('dotenv').config();
const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(config);
const app = express();
app.use(middleware(config));
app.use(express.json());

let lastRequestTime = 0;
const COOLDOWN_MS = 2000; // 每次請求間至少 2 秒

// 載入 FAQ JSON 檔案
const faqPath = path.join(__dirname, 'faq.json');
let faqList = [];

try {
  faqList = JSON.parse(fs.readFileSync(faqPath, 'utf8'));
} catch (e) {
  console.error('讀取 FAQ 失敗：', e.message);
}

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || !events.length) return res.status(200).end();

  await Promise.all(events.map(async (event) => {
    // ✅ 歡迎訊息處理
    if (event.type === 'follow') {
      try {
        const profile = await client.getProfile(event.source.userId);
        const name = profile.displayName || '朋友';
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `歡迎加入，${name}！我是文山智能客服，有問題隨時問我 🤖`
        });
      } catch (err) {
        console.error('取得用戶名稱失敗：', err.message);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '感謝加入！我是文山智能客服，有問題隨時問我 🤖'
        });
      }
    }

    // ✅ 處理文字訊息
    if (event.type !== 'message' || event.message.type !== 'text') return;

    const userInput = event.message.text;
    let gptReply = '抱歉，發生錯誤，請稍後再試。';

    // ✅ FAQ 模糊關鍵字比對
    const matchedFAQ = faqList.find(faq =>
      faq.keywords.some(keyword => userInput.includes(keyword))
    );

    if (matchedFAQ) {
      gptReply = matchedFAQ.reply;
    } else {
      // ✅ 加入冷卻機制防止 OpenAI API 過度使用
      const now = Date.now();
      if (now - lastRequestTime < COOLDOWN_MS) {
        gptReply = '請稍候再試 🙏（冷卻中）';
      } else {
        lastRequestTime = now;

        try {
          const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: '你是位親切的線上客服，具有專業的稅務諮詢能力，也擅長辦理公司行號相關的設立、變更登記，條列式回答簡短明確，可以用一點emoji',
                },
                {
                  role: 'user',
                  content: userInput
                }
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
            }
          );
          gptReply = response.data.choices[0].message.content || '（無內容）';
        } catch (err) {
          console.error('OpenAI Error:', err.message);
          if (err.response?.status === 429) {
            gptReply = '請求過於頻繁，請稍後再試（429）';
          } else if (err.response?.status === 404) {
            gptReply = '模型錯誤（404），請檢查 model 名稱';
          }
        }
      }
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: gptReply
    });
  }));

  res.status(200).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});