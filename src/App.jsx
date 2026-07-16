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
  const [analyzedText, setAnalyzedText] = useState('') // 마지막으로 분석한 텍스트

  const videoRef = useRef(null)
  const streamRef = useRef(null)
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
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
          },
          videoRef.current,
          (result) => {
            if (confirmedRef.current || !result) return
            const code = result.getText()

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
        // video 스트림을 별도로 저장 (수동 촬영용)
        streamRef.current = videoRef.current?.srcObject
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

  // 화면 탭 시 그 지점에 초점 맞추기 (iOS Safari 트릭)
  const handleVideoTap = async () => {
    const stream = videoRef.current?.srcObject
    if (!stream) return
    const [track] = stream.getVideoTracks()
    if (!track) return
    try {
      // 초점 재설정 시도
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' }]
      })
    } catch (e) {
      // 지원 안 하는 브라우저는 무시
    }
  }

  // 수동 촬영: 현재 비디오 프레임을 캡처해서 서버로 보냄
  const captureBarcode = async () => {
    if (!videoRef.current) return

    setBarcodeMsg('사진 인식 중...')

    // 비디오 프레임을 캔버스에 그려서 이미지로 변환
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg', 0.95)

    // 스캐너 닫기
    controlsRef.current?.stop()
    setScannerOpen(false)

    // 서버로 보내서 Google Vision으로 인식
    try {
      const response = await fetch('https://ingredient-scanner-server.onrender.com/barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData })
      })
      const data = await response.json()
      if (data.barcode) {
        setBarcodeMsg(`바코드 인식: ${data.barcode}`)
        await fetchProductByBarcode(data.barcode)
      } else {
        setBarcodeMsg('❌ 바코드를 인식하지 못했어요. 다시 시도하거나 성분표를 카메라로 찍어주세요.')
      }
    } catch (error) {
      setBarcodeMsg('❌ 바코드 인식 중 오류가 발생했어요.')
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

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setOcrLoading(true)
    setIngredients('')
    setResult('')
    setAnalyzedText('')
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
    setAnalyzedText('')
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
    setAnalyzedText('')
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
        setAnalyzedText(text) // 분석 완료 기록
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

  // 분석 완료 상태: 결과가 있고, 텍스트가 마지막 분석 때와 같을 때
  const isAnalyzed = result && ingredients.trim() === analyzedText.trim()

  return (
    <div className="container">
      {loading && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
          <div style={styles.progressLabel}>{progress}%</div>
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
              <video
                ref={videoRef}
                style={styles.scannerVideo}
                muted
                playsInline
                onClick={handleVideoTap}
              />
              <div style={styles.scannerGuide}>
                <div style={styles.scannerFrame}>
                  <div style={styles.scanLine} />
                </div>
                <p style={styles.scannerHint}>
                  자동 인식이 안 되면 아래 <b>촬영</b> 버튼을 눌러주세요.<br />
                  화면을 탭하면 초점이 다시 맞춰집니다.
                </p>
              </div>

              {/* 촬영 + 닫기 버튼 하단 */}
              <div style={styles.scannerControls}>
                <button
                  type="button"
                  onClick={closeBarcodeScanner}
                  style={styles.scannerCloseBtn}
                >
                  ✕ 닫기
                </button>
                <button
                  type="button"
                  onClick={captureBarcode}
                  style={styles.scannerCaptureBtn}
                >
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
          style={isAnalyzed ? styles.analyzedButton : undefined}
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
  progressLabel: {
    position: 'absolute',
    top: 0,
    right: 8,
    fontSize: 12,
    color: '#333',
    fontWeight: 600,
  },
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
    cursor: 'pointer',
  },
  scannerGuide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 80,
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
    fontSize: 13,
    textAlign: 'center',
    textShadow: '0 1px 3px rgba(0,0,0,0.9)',
    padding: '0 20px',
    lineHeight: 1.5,
  },
  scannerControls: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    gap: 12,
    padding: '0 16px',
  },
  scannerCloseBtn: {
    background: 'rgba(255,255,255,0.9)',
    color: '#111',
    border: 'none',
    borderRadius: 24,
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  scannerCaptureBtn: {
    background: '#111',
    color: '#fff',
    border: '3px solid #fff',
    borderRadius: 24,
    padding: '12px 28px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  },
  analyzedButton: {
    background: '#4caf50',
    color: '#fff',
    cursor: 'not-allowed',
  },
}

export default App