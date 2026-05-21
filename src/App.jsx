import { useState, useEffect, useRef } from 'react'
import './App.css'
import ReactMarkdown from 'react-markdown'
import Tesseract from 'tesseract.js'
import { BrowserMultiFormatReader } from '@zxing/library'

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
  const [showCamera, setShowCamera] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [barcodeMsg, setBarcodeMsg] = useState('바코드를 카메라에 비춰주세요')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const barcodeVideoRef = useRef(null)
  const barcodeReaderRef = useRef(null)

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

  const startCamera = async () => {
    setShowCamera(true)
    setPreview(null)
    setIngredients('')
    setResult('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      streamRef.current = stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      }, 100)
    } catch (err) {
      alert('카메라에 접근할 수 없어요. 브라우저에서 카메라 권한을 허용해주세요.')
      setShowCamera(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }

  const capturePhoto = async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)

    const imageUrl = canvas.toDataURL('image/png')
    setPreview(imageUrl)
    stopCamera()

    setOcrLoading(true)
    canvas.toBlob(async (blob) => {
      const { data: { text } } = await Tesseract.recognize(blob, 'eng')
      setIngredients(text)
      setOcrLoading(false)
    })
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setOcrLoading(true)
    setIngredients('')
    setResult('')

    const { data: { text } } = await Tesseract.recognize(file, 'eng')
    setIngredients(text)
    setOcrLoading(false)
  }

  const startBarcodeScanner = async () => {
    setShowBarcodeScanner(true)
    setResult('')
    setBarcodeMsg('바코드를 카메라에 비춰주세요')

    try {
      const reader = new BrowserMultiFormatReader()
      barcodeReaderRef.current = reader

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      streamRef.current = stream

      setTimeout(async () => {
        if (barcodeVideoRef.current) {
          barcodeVideoRef.current.srcObject = stream
          await barcodeVideoRef.current.play()

          reader.decodeFromVideoElement(barcodeVideoRef.current, async (result, err) => {
            if (result) {
              const barcode = result.getText()
              stopBarcodeScanner()
              setBarcodeMsg(`바코드 인식: ${barcode}`)
              await fetchProductByBarcode(barcode)
            }
          })
        }
      }, 100)
    } catch (err) {
      alert('카메라에 접근할 수 없어요.')
      setShowBarcodeScanner(false)
    }
  }

  const stopBarcodeScanner = () => {
    if (barcodeReaderRef.current) {
      barcodeReaderRef.current.reset()
      barcodeReaderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setShowBarcodeScanner(false)
  }

  const fetchProductByBarcode = async (barcode) => {
    setOcrLoading(true)
    setBarcodeMsg(`바코드 ${barcode} 제품 정보 가져오는 중...`)

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
        } else {
          setBarcodeMsg('❌ 이 제품의 성분 정보가 없어요. 직접 입력해주세요.')
        }
      } else {
        setBarcodeMsg('❌ 제품을 찾을 수 없어요. 직접 입력해주세요.')
      }
    } catch (err) {
      setBarcodeMsg('❌ 제품 정보를 가져오지 못했어요. 직접 입력해주세요.')
    }

    setOcrLoading(false)
  }

  const analyze = async () => {
    if (!ingredients.trim()) return
    setLoading(true)
    setResult('')

    try {
      const response = await fetch('https://ingredient-scanner-server.onrender.com/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients })
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

        {showCamera ? (
          <div className="camera-box">
            <video ref={videoRef} autoPlay playsInline className="camera-video" />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="camera-buttons">
              <button className="button-capture" onClick={capturePhoto}>📷 찍기</button>
              <button className="button-cancel" onClick={stopCamera}>취소</button>
            </div>
          </div>
        ) : showBarcodeScanner ? (
          <div className="camera-box">
            <video ref={barcodeVideoRef} autoPlay playsInline className="camera-video" />
            <div className="camera-buttons">
              <button className="button-cancel" onClick={stopBarcodeScanner}>취소</button>
            </div>
          </div>
        ) : (
          <div className="upload-buttons">
            <button className="button-webcam" onClick={startCamera}>
              📷 카메라로 찍기
            </button>
            <label className="button-upload">
              📁 사진 업로드
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button className="button-webcam" onClick={startBarcodeScanner}>
              📊 바코드 스캔
            </button>
          </div>
        )}

        {preview && !showCamera && !showBarcodeScanner && (
          <img src={preview} alt="캡처된 이미지" className="preview-img" />
        )}

        {barcodeMsg && !showBarcodeScanner && barcodeMsg !== '바코드를 카메라에 비춰주세요' && (
          <p className="ocr-loading">{barcodeMsg}</p>
        )}

        {ocrLoading && <p className="ocr-loading">이미지에서 텍스트 인식 중...</p>}
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