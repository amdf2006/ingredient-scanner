import { useState, useEffect, useRef } from 'react'
import './App.css'
import ReactMarkdown from 'react-markdown'
import Tesseract from 'tesseract.js'
import Quagga from '@ericblade/quagga2'

const LOADING_MESSAGES = [
  '성분표를 읽는 중...',
  '유해 성분 확인 중...',
  '건강 영향 분석 중...',
  '결과 정리 중...',
]

function App() {
  const [ingredients, setIngredients] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [progress, setProgress] = useState(0)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [barcodeMsg, setBarcodeMsg] = useState('')

  useEffect(() => {
    if (!loading) return
    setProgress(0)
    setLoadingMsg(LOADING_MESSAGES[0])

    let msgIndex = 0
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[msgIndex])
    }, 1500)

    const progressInterval = setInterval(() => {
      setProgress(prev => prev < 90 ? prev + 2 : prev)
    }, 100)

    return () => {
      clearInterval(msgInterval)
      clearInterval(progressInterval)
    }
  }, [loading])

  const analyzeIngredients = async (text) => {
    if (!text.trim()) return
    setLoading(true)
    setResult('')

    try {
      const response = await fetch('https://ingredient-scanner-server.onrender.com/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: text })
      })

      const data = await response.json()
      setProgress(100)
      setTimeout(() => {
        setResult(data.result)
        setLoading(false)
        setProgress(0)
      }, 300)
    } catch (error) {
      setResult('서버 연결에 실패했어요. 다시 시도해주세요.')
      setLoading(false)
      setProgress(0)
    }
  }

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setOcrLoading(true)
    setIngredients('')
    setResult('')
    setBarcodeMsg('')

    const { data: { text } } = await Tesseract.recognize(file, 'eng')
    setIngredients(text)
    setOcrLoading(false)
    await analyzeIngredients(text)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setOcrLoading(true)
    setIngredients('')
    setResult('')
    setBarcodeMsg('')

    const { data: { text } } = await Tesseract.recognize(file, 'eng')
    setIngredients(text)
    setOcrLoading(false)
    await analyzeIngredients(text)
  }

  const handleBarcodeCapture = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setBarcodeMsg('바코드 인식 중...')
    setIngredients('')
    setResult('')

    await scanBarcodeFromFile(file)
  }

  const scanBarcodeFromFile = async (file) => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      Quagga.decodeSingle({
        decoder: {
          readers: [
            'ean_reader',
            'ean_8_reader',
            'upc_reader',
            'upc_e_reader',
            'code_128_reader',
          ]
        },
        locate: true,
        src: url
      }, async (result) => {
        URL.revokeObjectURL(url)
        if (result && result.codeResult) {
          const barcode = result.codeResult.code
          setBarcodeMsg(`바코드 인식: ${barcode}`)
          await fetchProductByBarcode(barcode)
        } else {
          setBarcodeMsg('❌ 바코드를 인식하지 못했어요. 다시 찍어주세요.')
        }
        resolve()
      })
    })
  }

  const fetchProductByBarcode = async (barcode) => {
    setOcrLoading(true)
    setBarcodeMsg('제품 정보 가져오는 중...')

    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`)
      const data = await response.json()

      if (data.status === 1 && data.product) {
        const product = data.product
        const ingredientText = product.ingredients_text || product.ingredients_text_en || ''
        const productName = product.product_name || '알 수 없는 제품'

        if (ingredientText) {
          setIngredients(ingredientText)
          setBarcodeMsg(`✅ ${productName} 성분 정보를 가져왔어요!`)
          setOcrLoading(false)
          await analyzeIngredients(ingredientText)
        } else {
          setBarcodeMsg('❌ 이 제품의 성분 정보가 없어요. 직접 입력해주세요.')
          setOcrLoading(false)
        }
      } else {
        setBarcodeMsg('❌ 제품을 찾을 수 없어요. 직접 입력해주세요.')
        setOcrLoading(false)
      }
    } catch (err) {
      setBarcodeMsg('❌ 제품 정보를 가져오지 못했어요. 직접 입력해주세요.')
      setOcrLoading(false)
    }
  }

  const analyze = async () => {
    await analyzeIngredients(ingredients)
  }

  return (
    <div className="container">
      {loading && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="header">
        <div className="header-icon">🔍</div>
        <h1 className="header-title">성분 스캐너</h1>
        <p className="header-subtitle">성분표를 입력하거나 사진을 올려주세요</p>
      </div>

      <div className="card">
        <label className="label">사진 촬영 / 업로드</label>

        <div className="upload-buttons">
          <label className="button-webcam">
            📷 카메라로 찍기
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              style={{ display: 'none' }}
            />
          </label>
          <label className="button-upload">
            📁 사진 업로드
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>
          <label className="button-webcam">
            📊 바코드 스캔
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleBarcodeCapture}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {preview && (
          <img src={preview} alt="캡처된 이미지" className="preview-img" />
        )}

        {barcodeMsg !== '' && (
          <p className="ocr-loading">{barcodeMsg}</p>
        )}

        {ocrLoading && <p className="ocr-loading">처리 중...</p>}
      </div>

      <div className="card">
        <label className="label">성분표 입력</label>
        <textarea
          className="textarea"
          placeholder="예) Water, Sodium Lauryl Sulfate, Sodium Benzoate..."
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          disabled={loading}
        />
        <button
          className={`button ${loading ? 'button-loading' : ''}`}
          onClick={analyze}
          disabled={loading || ocrLoading}
        >
          {loading ? (
            <span className="loading-content">
              <span className="spinner" />
              {loadingMsg}
            </span>
          ) : '성분 분석하기'}
        </button>
      </div>

      {result && (
        <div className="card result-card">
          <label className="label">분석 결과</label>
          <div className="result-text">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

export default App