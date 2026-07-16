import { useState, useEffect, useRef } from 'react'
import './App.css'
import ReactMarkdown from 'react-markdown'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'

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
  const [scannerOpen, setScannerOpen] = useState(false)

  // 실시간 바코드 스캐너용 refs
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const lastCodeRef = useRef(null)
  const hitCountRef = useRef(0)
  const confirmedRef = useRef(false)

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

  // 실시간 바코드 스캐너 시작
  useEffect(() => {
    if (!scannerOpen) return

    // 상태 초기화
    lastCodeRef.current = null
    hitCountRef.current = 0
    confirmedRef.current = false

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.EAN_8,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)

    const reader = new BrowserMultiFormatReader(hints)
    let cancelled = false

    const start = async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result) => {
            if (confirmedRef.current || !result) return
            const code = result.getText()

            // 같은 코드가 2번 연속 읽혀야 확정 (오독 방지)
            if (code === lastCodeRef.current) {
              hitCountRef.current += 1
            } else {
              lastCodeRef.current = code
              hitCountRef.current = 1
            }

            if (hitCountRef.current >= 2) {
              confirmedRef.current = true
              if (navigator.vibrate) navigator.vibrate(80)
              controlsRef.current?.stop()
              setScannerOpen(false)
              setBarcodeMsg(`바코드 인식: ${code}`)
              fetchProductByBarcode(code)
            }
          }
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
      } catch (e) {
        console.error('카메라 시작 실패:', e)
        setBarcodeMsg('❌ 카메라를 사용할 수 없어요. 브라우저 카메라 권한을 확인해주세요.')
        setScannerOpen(false)
      }
    }

    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [scannerOpen])

  const runOCR = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const imageData = e.target.result
        try {
          const response = await fetch('https://ingredient-scanner-server.onrender.com/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData })
          })
          const data = await response.json()
          resolve(data.text || '')
        } catch (error) {
          resolve('')
        }
      }
      reader.readAsDataURL(file)
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

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setOcrLoading(true)
    setIngredients('')
    setResult('')
    setBarcodeMsg('')

    const text = await runOCR(file)
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

    const text = await runOCR(file)
    setIngredients(text)
    setOcrLoading(false)
    await analyzeIngredients(text)
  }

  const openBarcodeScanner = () => {
    setPreview(null)
    setIngredients('')
    setResult('')
    setBarcodeMsg('바코드를 카메라에 비춰주세요...')
    setScannerOpen(true)
  }

  const closeBarcodeScanner = () => {
    setScannerOpen(false)
    setBarcodeMsg('')
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
          <button
            type="button"
            className="button-webcam"
            onClick={openBarcodeScanner}
          >
            📊 바코드 스캔
          </button>
        </div>

        {/* 실시간 바코드 스캐너 오버레이 */}
        {scannerOpen && (
          <div style={styles.scannerOverlay}>
            <div style={styles.scannerBox}>
              <video ref={videoRef} style={styles.scannerVideo} muted playsInline />
              <div style={styles.scannerGuide}>
                <div style={styles.scannerFrame}>
                  <div style={styles.scanLine} />
                </div>
                <p style={styles.scannerHint}>
                  바코드를 사각형 안에 가로로 맞춰주세요.<br />
                  병은 천천히 돌려보세요.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBarcodeScanner}
                style={styles.scannerClose}
              >
                ✕ 닫기
              </button>
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

const styles = {
  scannerOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.92)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  scannerBox: {
    position: 'relative',
    width: '100%',
    maxWidth: 480,
  },
  scannerVideo: {
    width: '100%',
    borderRadius: 12,
    background: '#000',
    display: 'block',
  },
  scannerGuide: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  scannerFrame: {
    width: '75%',
    height: 130,
    border: '3px solid rgba(255,255,255,0.9)',
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    background: 'rgba(255,60,60,0.9)',
    top: '50%',
  },
  scannerHint: {
    marginTop: 16,
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
    padding: '0 20px',
    lineHeight: 1.5,
  },
  scannerClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    background: 'rgba(255,255,255,0.95)',
    color: '#111',
    border: 'none',
    borderRadius: 20,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
}

export default App