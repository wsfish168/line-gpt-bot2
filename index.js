require('dotenv').config();

const faqList = [
  {
    keywords: ["營業時間", "幾點開始", "幾點關門"],
    reply: "我們的營業時間為週一至週五 09:00 - 17:30 🕘"
  },
  {
    keywords: ["地址", "在哪裡", "地點"],
    reply: "我們位於新北市中和區中山路二段332巷9號8樓 🏢"
  },
  {
    keywords: ["公司設立", "創業", "登記公司"],
    reply: "公司設立流程包括：命名、資本額、章程、設立登記等。如需協助請告訴我 😊"
  },
  {
    keywords: ["報稅", "營業稅", "繳稅"],
    reply: "營業稅(=)(開出去發票(minus sign)拿到營運相關的發票)x5% (pencil)開發票:報價時通常會「外加5%」給買方 也就是幫政府代收付的性質  (money bag)營業稅是 發票抵發票、5%抵5% 只有拿到營運相關的發票有節稅效果(red arrow right)記得打統編唷"
  }
];


const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const axios = require('axios');

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

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || !events.length) return res.status(200).end();

  await Promise.all(events.map(async (event) => {
    // 歡迎訊息：新用戶加入
    if (event.type === 'follow') {
      try {
        const profile = await client.getProfile(event.source.userId);
        const name = profile.displayName || '朋友';
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: `歡迎加入，${name}！我是文山智能助理，有問題隨時問我 🤖`
        });
      } catch (err) {
        console.error('取得用戶名稱失敗：', err.message);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '感謝加入！我是文山智能助理，有問題隨時問我 🤖'
        });
      }
    }

    if (event.type !== 'message' || event.message.type !== 'text') return;

    const userInput = event.message.text;
    let gptReply = '抱歉，發生錯誤，請稍後再試。';

    // FAQ 模糊匹配邏輯
for (const faq of faqList) {
  if (faq.keywords.some(keyword => userInput.includes(keyword))) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: faq.reply
    });
  }
}
    
    // 加入冷卻機制
    const now = Date.now();
    if (now - lastRequestTime < COOLDOWN_MS) {
      gptReply = '請稍候再試。';
    } else {
      lastRequestTime = now;
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: '你是位親切的線上客服，擅長處理中小企業稅務問題與公司行號設立登記，請條列式簡短明確的回答，並適時加上 emoji 提示重點' },
              { role: 'user', content: userInput },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        gptReply = response.data.choices[0].message.content || '（沒有內容）';
      } catch (err) {
        console.error('OpenAI Error:', err.message);
        if (err.response?.status === 429) {
          gptReply = '請求過於頻繁，請稍後再試（429）';
        } else if (err.response?.status === 404) {
          gptReply = '模型錯誤（404），請檢查 model 名稱';
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
