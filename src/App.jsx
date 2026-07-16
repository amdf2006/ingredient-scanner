import { useState, useEffect, useRef } from 'react'
import './App.css'
import ReactMarkdown from 'react-markdown'

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
  const [analyzedText, setAnalyzedText] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState('photo') // 'photo' or 'barcode'

  const videoRef = useRef(null)
  const streamRef = useRef(null)

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

  // 카메라 시작 (후면 강제)
  useEffect(() => {
    if (!cameraOpen) return

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { exact: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (e) {
        // exact 실패 시 일반 environment로 재시도
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          })
          streamRef.current = stream
          if (videoRef.current) videoRef.current.srcObject = stream
        } catch (err) {
          console.error('카메라 오류:', err)
          setBarcodeMsg('❌ 카메라를 사용할 수 없어요. 브라우저 권한을 확인해주세요.')
          setCameraOpen(false)
        }
      }
    }

    startCamera()

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [cameraOpen])

  const openCamera = (mode) => {
    setPreview(null)
    setIngredients('')
    setResult('')
    setAnalyzedText('')
    setBarcodeMsg('')
    setCameraMode(mode)
    setCameraOpen(true)
  }

  const closeCamera = () => {
    setCameraOpen(false)
  }

  // 촬영 후 처리
  const takePhoto = async () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg', 0.95)

    // 미리보기 설정
    setPreview(imageData)

    // 카메라 닫기
    setCameraOpen(false)

    if (cameraMode === 'barcode') {
      // 바코드 인식
      setBarcodeMsg('바코드 인식 중...')
      try {
        const response = await fetch('https://ingredient-scanner-server.onrender.com/barcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData })
        })
        const data = await response.json()
        if (data.barcode) {
          setBarcodeMsg(`✅ 바코드 인식: ${data.barcode}`)
          await fetchProductByBarcode(data.barcode)
        } else {
          setBarcodeMsg('❌ 바코드를 인식하지 못했어요. 더 선명하게 다시 찍어주세요.')
        }
      } catch (error) {
        setBarcodeMsg('❌ 바코드 인식 중 오류가 발생했어요.')
      }
    } else {
      // 성분표 OCR
      setOcrLoading(true)
      try {
        const response = await fetch('https://ingredient-scanner-server.onrender.com/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData })
        })
        const data = await response.json()
        const text = data.text || ''
        setIngredients(text)
        setOcrLoading(false)
        await analyzeIngredients(text)
      } catch (error) {
        setOcrLoading(false)
      }
    }
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
          setBarcodeMsg('❌ 이 제품의 성분 정보가 없어요. 성분표를 카메라로 찍어주세요.')
          setOcrLoading(false)
        }
      } else {
        setBarcodeMsg('❌ 제품을 찾을 수 없어요. 성분표를 카메라로 찍어주세요.')
        setOcrLoading(false)
      }
    } catch (err) {
      setBarcodeMsg('❌ 제품 정보를 가져오지 못했어요. 성분표를 카메라로 찍어주세요.')
      setOcrLoading(false)
    }
  }

  // 갤러리에서 업로드 (성분표만)
  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (ev) => {
      const imageData = ev.target.result
      setPreview(imageData)
      setOcrLoading(true)
      setIngredients('')
      setResult('')
      setAnalyzedText('')
      setBarcodeMsg('')

      try {
        const response = await fetch('https://ingredient-scanner-server.onrender.com/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData })
        })
        const data = await response.json()
        const text = data.text || ''
        setIngredients(text)
        setOcrLoading(false)
        await analyzeIngredients(text)
      } catch (error) {
        setOcrLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

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
        setAnalyzedText(text)
        setLoading(false)
        setProgress(0)
      }, 300)
    } catch (error) {
      setResult('서버 연결에 실패했어요. 다시 시도해주세요.')
      setLoading(false)
      setProgress(0)
    }
  }

  const analyze = async () => {
    await analyzeIngredients(ingredients)
  }

  const isAnalyzed = result && ingredients.trim() === analyzedText.trim()

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
          <button type="button" className="button-webcam" onClick={() => openCamera('photo')}>
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
          <button type="button" className="button-webcam" onClick={() => openCamera('barcode')}>
            📊 바코드 촬영
          </button>
        </div>

        {/* 자체 카메라 화면 */}
        {cameraOpen && (
          <div style={styles.overlay}>
            <div style={styles.cameraBox}>
              <video ref={videoRef} style={styles.video} autoPlay muted playsInline />
              <p style={styles.hint}>
                {cameraMode === 'barcode'
                  ? '바코드에 초점이 맞을 때까지 기다린 후 촬영하세요.'
                  : '성분표에 초점이 맞을 때까지 기다린 후 촬영하세요.'}
              </p>
              <div style={styles.controls}>
                <button type="button" onClick={closeCamera} style={styles.closeBtn}>
                  ✕ 닫기
                </button>
                <button type="button" onClick={takePhoto} style={styles.captureBtn}>
                  📸 촬영
                </button>
              </div>
            </div>
          </div>
        )}

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
          disabled={loading || ocrLoading || isAnalyzed}
          style={isAnalyzed ? { background: '#4caf50', color: '#fff', cursor: 'not-allowed' } : undefined}
        >
          {loading ? (
            <span className="loading-content">
              <span className="spinner" />
              {loadingMsg} ({progress}%)
            </span>
          ) : isAnalyzed ? '✅ 성분 분석 완료' : '성분 분석하기'}
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

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.95)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  cameraBox: {
    position: 'relative',
    width: '100%',
    maxWidth: 480,
  },
  video: {
    width: '100%',
    borderRadius: 12,
    background: '#000',
    display: 'block',
  },
  hint: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    padding: '0 20px',
    lineHeight: 1.5,
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    gap: 16,
    marginTop: 20,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.9)',
    color: '#111',
    border: 'none',
    borderRadius: 24,
    padding: '14px 24px',
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
  captureBtn: {
    background: '#111',
    color: '#fff',
    border: '3px solid #fff',
    borderRadius: 24,
    padding: '14px 32px',
    fontSize: 17,
    fontWeight: 700,
    cursor: 'pointer',
  },
}

export default App