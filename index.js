require('dotenv').config();
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

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (!events || !events.length) return res.status(200).end();

  await Promise.all(events.map(async (event) => {
    if (event.type !== 'message' || event.message.type !== 'text') return;

    const userInput = event.message.text;
    let gptReply = '抱歉，我無法理解。';

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [{ role: 'user', content: userInput }],
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      gptReply = response.data.choices[0].message.content;
    } catch (err) {
      console.error('OpenAI Error:', err.message);
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
