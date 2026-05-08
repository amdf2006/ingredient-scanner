import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

app.post('/analyze', async (req, res) => {
  try {
    const { ingredients } = req.body

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `다음 성분표를 분석해서 건강에 해로운 성분이 있으면 알려줘. 성분명, 위험도(위험/주의/안전), 이유를 설명해줘.\n\n${ingredients}`
        }]
      })
    })

    const data = await response.json()
    console.log('API 응답:', JSON.stringify(data))

    if (data.content && data.content[0]) {
      res.json({ result: data.content[0].text })
    } else {
      res.json({ result: '오류: ' + JSON.stringify(data) })
    }
  } catch (error) {
    console.error('오류:', error)
    res.status(500).json({ result: '서버 오류가 발생했어요: ' + error.message })
  }
})

app.listen(3001, () => {
  console.log('서버 실행 중: http://localhost:3001')
})