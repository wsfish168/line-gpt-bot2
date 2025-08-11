import express from 'express';
import line from '@line/bot-sdk';
import fs from 'fs';
import OpenAI from 'openai';
import path from 'path';

const app = express();

// LINE 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// FAQ 載入
const faqPath = path.join(process.cwd(), 'faq.json');
let faqData = [];
if (fs.existsSync(faqPath)) {
  faqData = JSON.parse(fs.readFileSync(faqPath, 'utf8'));
}

// 記錄已發送過歡迎訊息的使用者
const welcomedUsers = new Set();

// 關鍵字模糊比對
function findFaqAnswer(message) {
  const lowerMsg = message.toLowerCase();
  for (let item of faqData) {
    for (let keyword of item.keywords) {
      if (lowerMsg.includes(keyword.toLowerCase())) {
        return item.reply;
      }
    }
  }
  return null;
}

// 處理 LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  Promise.all(req.body.events.map(handleEvent)).then(result => res.json(result));
});

// 處理事件
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const userMessage = event.message.text.trim();

  // 第一次互動 → 發送客製化歡迎訊息
  if (!welcomedUsers.has(userId)) {
    try {
      const profile = await client.getProfile(userId);
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `嗨 ${profile.displayName} 👋 歡迎來到文山智慧客服，請問今天想了解什麼呢？`
      });
      welcomedUsers.add(userId);
      return;
    } catch (err) {
      console.error('取得使用者名字失敗', err);
    }
  }

  // FAQ 回覆
  const faqReply = findFaqAnswer(userMessage);
  if (faqReply) {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: faqReply
    });
  }

  // ChatGPT 回覆
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: '你是位親切的線上客服，具有專業的稅務諮詢能力，也擅長辦理公司行號相關的設立、變更登記，回答簡短明確，可以用一點emoji'
        },
        { role: 'user', content: userMessage }
      ]
    });

    const gptReply = completion.choices[0].message.content;
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: gptReply
    });

  } catch (error) {
    console.error('OpenAI Error:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '抱歉，我目前無法回應，請稍後再試 🙏'
    });
  }
}

// UptimeRobot Ping 防休眠
app.get('/', (req, res) => {
  res.send('LINE Bot is running.');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
