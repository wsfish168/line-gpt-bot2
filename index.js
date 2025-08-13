import express from 'express';
import dotenv from 'dotenv';
import { middleware, Client } from '@line/bot-sdk';
import fs from 'fs';
import OpenAI from 'openai';

dotenv.config();

// LINE 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const app = express();
const lineClient = new Client(config);

// OpenAI 設定（新版語法）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 載入 FAQ
const faqData = JSON.parse(fs.readFileSync('faq.json', 'utf8'));

// 文字相似度（簡單模糊比對）
function isSimilar(str1, str2) {
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  return str1.includes(str2) || str2.includes(str1);
}

// 處理訊息
app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error('Webhook Error:', err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type === 'follow') {
    // 新朋友歡迎訊息
    try {
      const profile = await lineClient.getProfile(event.source.userId);
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: `嗨 ${profile.displayName}，很高興認識你！我是你的線上客服 🤗\n你可以問我稅務或公司登記的問題喔～`
      });
    } catch (err) {
      console.error('歡迎訊息錯誤：', err);
    }
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const userMsg = event.message.text.trim();

  // FAQ 偵測（三級匹配）
  let faqReply = null;

  // 第一層：完全相符
  let found = faqData.find(f => f.keywords.some(k => k === userMsg));
  if (found) faqReply = found.reply;

  // 第二層：部分包含
  if (!faqReply) {
    found = faqData.find(f => f.keywords.some(k => userMsg.includes(k)));
    if (found) faqReply = found.reply;
  }

  // 第三層：模糊比對
  if (!faqReply) {
    found = faqData.find(f => f.keywords.some(k => isSimilar(userMsg, k)));
    if (found) faqReply = found.reply;
  }

  if (faqReply) {
    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: faqReply
    });
    return;
  }

  // 沒匹配到 → 呼叫 GPT
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: '你是位親切的線上客服，具有專業的稅務諮詢能力，也擅長辦理公司行號相關的設立、變更登記，回答簡短明確，可以用一點emoji。'
        },
        { role: 'user', content: userMsg }
      ]
    });

    const gptReply = completion.choices[0].message.content.trim();
    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: gptReply
    });
  } catch (err) {
    console.error('OpenAI API 錯誤：', err);
    await lineClient.replyMessage(event.replyToken, {
      type: 'text',
      text: '抱歉，我現在有點忙碌，請稍後再試一次 🙏'
    });
  }
}

// 健康檢查（防 Render 睡眠）
app.get('/', (req, res) => {
  res.send('LINE GPT Bot 正常運行中 🚀');
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
