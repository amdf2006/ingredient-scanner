import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import dotenv from 'dotenv'
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } from '@zxing/library'
import { Jimp } from 'jimp'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function callAnthropicAPI(ingredients, maxRetries = 3) {
  const prompt = [
    '다음 성분표를 분석해줘. 각 성분마다 위험도(위험/주의/안전)와 짧은 설명을 붙여줘.',
    '',
    '반드시 아래 JSON 형식으로만 답변하고, JSON 앞뒤에 다른 설명은 절대 넣지 마.',
    '',
    '{',
    '  "items": [',
    '    {',
    '      "name": "성분명 (영문/원문)",',
    '      "level": "위험" 또는 "주의" 또는 "안전",',
    '      "description": "왜 그런지 짧게 한 문장"',
    '    }',
    '  ]',
    '}',
    '',
    '규칙:',
    '- "level"은 반드시 "위험", "주의", "안전" 셋 중 하나만 사용',
    '- 위험: 알레르기 유발, 발암성 의심, 내분비 교란 등 명확한 우려',
    '- 주의: 특정 조건(고농도, 민감 피부 등)에서 문제 가능',
    '- 안전: 일반적으로 안전한 성분',
    '- description은 30자 이내로 간결하게',
    '- 물, 향료 같은 흔한 성분도 반드시 포함',
    '',
    '성분표:',
    ingredients
  ].join('\n')

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      })

      const data = await response.json()

      if (data.content && data.content[0]) {
        return { success: true, result: data.content[0].text }
      }

      if (data.error && (data.error.type === 'overloaded_error' || data.error.type === 'rate_limit_error')) {
        console.log('Attempt ' + attempt + '/' + maxRetries + ': ' + data.error.type + ', retrying...')
        if (attempt < maxRetries) {
          await sleep(2000 * attempt)
          continue
        }
        return { success: false, error: '지금 AI 서버가 많이 붐비고 있어요. 30초 정도 후 다시 시도해주세요.' }
      }

      return { success: false, error: '분석 중 오류가 발생했어요: ' + (data.error?.message || JSON.stringify(data)) }
    } catch (error) {
      console.error('Attempt ' + attempt + ' error:', error.message)
      if (attempt < maxRetries) {
        await sleep(2000 * attempt)
        continue
      }
      return { success: false, error: '서버 연결에 실패했어요: ' + error.message }
    }
  }
  return { success: false, error: '알 수 없는 오류가 발생했어요.' }
}

app.post('/analyze', async (req, res) => {
  try {
    const { ingredients } = req.body
    const result = await callAnthropicAPI(ingredients)

    if (result.success) {
      res.json({ result: result.result })
    } else {
      res.json({ error: result.error })
    }
  } catch (error) {
    console.error('/analyze error:', error)
    res.status(500).json({ error: '서버 오류가 발생했어요: ' + error.message })
  }
})

app.post('/ocr', async (req, res) => {
  try {
    const { imageData } = req.body
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')

    const response = await fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + process.env.GOOGLE_VISION_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Data },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      }
    )

    const data = await response.json()

    if (data.responses && data.responses[0] && data.responses[0].fullTextAnnotation) {
      const text = data.responses[0].fullTextAnnotation.text
      res.json({ text })
    } else {
      res.json({ text: '' })
    }
  } catch (error) {
    console.error('OCR error:', error)
    res.status(500).json({ text: '', error: error.message })
  }
})

async function tryZxing(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    const image = await Jimp.read(buffer)

    const angles = [0, 90, 180, 270]

    for (const angle of angles) {
      const rotated = angle === 0 ? image.clone() : image.clone().rotate(angle)
      const { width, height, data } = rotated.bitmap

      const luminances = new Uint8ClampedArray(width * height)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        luminances[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0
      }

      const source = new RGBLuminanceSource(luminances, width, height)
      const bitmap = new BinaryBitmap(new HybridBinarizer(source))

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.EAN_8,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new MultiFormatReader()
      reader.setHints(hints)

      try {
        const result = reader.decode(bitmap)
        if (result) return result.getText()
      } catch (e) {
        // 이 각도에선 못 찾음
      }
    }
    return null
  } catch (e) {
    console.error('ZXing error:', e.message)
    return null
  }
}

async function tryOcrBarcode(base64Data) {
  try {
    const response = await fetch(
      'https://vision.googleapis.com/v1/images:annotate?key=' + process.env.GOOGLE_VISION_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Data },
            features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
          }]
        })
      }
    )
    const data = await response.json()
    if (!data.responses?.[0]?.fullTextAnnotation) return null
    const text = data.responses[0].fullTextAnnotation.text

    const cleaned = text.replace(/[\s.\-]/g, '')
    const match13 = cleaned.match(/\d{13}/)
    if (match13) return match13[0]
    const match12 = cleaned.match(/\d{12}/)
    if (match12) return match12[0]
    const match8 = cleaned.match(/\d{8}/)
    if (match8) return match8[0]
    return null
  } catch (e) {
    console.error('OCR barcode error:', e.message)
    return null
  }
}

app.post('/barcode', async (req, res) => {
  try {
    const { imageData } = req.body
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')

    let barcode = await tryZxing(base64Data)
    if (barcode) {
      console.log('ZXing success:', barcode)
      return res.json({ barcode, method: 'zxing' })
    }

    barcode = await tryOcrBarcode(base64Data)
    if (barcode) {
      console.log('OCR success:', barcode)
      return res.json({ barcode, method: 'ocr' })
    }

    console.log('Barcode recognition failed')
    res.json({ barcode: null })
  } catch (error) {
    console.error('Barcode error:', error)
    res.status(500).json({ barcode: null, error: error.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log('Server running: http://localhost:' + PORT)
})