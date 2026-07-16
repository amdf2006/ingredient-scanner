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

app.post('/ocr', async (req, res) => {
  try {
    const { imageData } = req.body
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
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
    console.error('OCR 오류:', error)
    res.status(500).json({ text: '', error: error.message })
  }
})

// ZXing으로 바코드 디코딩 시도
async function tryZxing(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, 'base64')
    const image = await Jimp.read(buffer)

    // 회전을 여러 각도로 시도 (병 곡면 대응)
    const angles = [0, 90, 180, 270]

    for (const angle of angles) {
      const rotated = angle === 0 ? image.clone() : image.clone().rotate(angle)
      const { width, height, data } = rotated.bitmap

      // RGBA → 밝기값 배열로 변환
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
        // 이 각도에선 못 찾음, 다음 각도 시도
      }
    }
    return null
  } catch (e) {
    console.error('ZXing 오류:', e.message)
    return null
  }
}

// Google Vision OCR로 바코드 아래 숫자 추출 시도
async function tryOcrBarcode(base64Data) {
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
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

    // 12~13자리 연속 숫자 찾기 (UPC-A 12자리, EAN-13 13자리)
    // 공백/점/하이픈으로 분리된 경우도 지원
    const cleaned = text.replace(/[\s.\-]/g, '')
    const match13 = cleaned.match(/\d{13}/)
    if (match13) return match13[0]
    const match12 = cleaned.match(/\d{12}/)
    if (match12) return match12[0]
    const match8 = cleaned.match(/\d{8}/)
    if (match8) return match8[0]
    return null
  } catch (e) {
    console.error('OCR 바코드 오류:', e.message)
    return null
  }
}

app.post('/barcode', async (req, res) => {
  try {
    const { imageData } = req.body
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')

    // 1. ZXing 우선 시도 (진짜 바코드 디코딩)
    let barcode = await tryZxing(base64Data)
    if (barcode) {
      console.log('ZXing 성공:', barcode)
      return res.json({ barcode, method: 'zxing' })
    }

    // 2. 실패 시 OCR로 숫자 추출
    barcode = await tryOcrBarcode(base64Data)
    if (barcode) {
      console.log('OCR 성공:', barcode)
      return res.json({ barcode, method: 'ocr' })
    }

    console.log('바코드 인식 실패')
    res.json({ barcode: null })
  } catch (error) {
    console.error('바코드 오류:', error)
    res.status(500).json({ barcode: null, error: error.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`)
})