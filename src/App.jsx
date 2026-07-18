import { useState, useEffect } from 'react'
import './App.css'

const LOADING_MESSAGES = [
  '성분표를 읽는 중...',
  '유해 성분 확인 중...',
  '건강 영향 분석 중...',
  '결과 정리 중...',
]

// SVG 아이콘들
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
)

const IconCamera = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)

const IconFolder = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)

const IconBarcode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5v14M7 5v14M11 5v14M15 5v14M19 5v14" />
  </svg>
)

const IconBulb = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.5.5.9 1.1 1 1.8v.5h6v-.5c.1-.7.5-1.3 1-1.8A7 7 0 0 0 12 2z" />
  </svg>
)

const IconLeaf = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-.7 15.5-8.2 17.04M2 21c0-3 1.85-5.36 5.08-6" />
  </svg>
)

const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const IconClipboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
    <rect x="9" y="3" width="6" height="4" rx="1" />
  </svg>
)

const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const IconExternal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

// 제품 카테고리 이모지 매핑
const getCategoryEmoji = (productType) => {
  const map = {
    food: '🍽️',
    cosmetic: '💄',
    cleaning: '🧼',
    medicine: '💊',
    other: '📦',
  }
  return map[productType] || '📦'
}

// JSON 파싱
function parseAnalysisResult(text) {
  if (!text) return { data: null, debug: 'text is empty' }
  try {
    let cleaned = text.trim()
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '')
    cleaned = cleaned.replace(/\s*```\s*$/i, '')
    cleaned = cleaned.trim()

    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return { data: null, debug: '중괄호 없음. 앞 200자: ' + cleaned.substring(0, 200) }
    }

    const jsonStr = cleaned.substring(firstBrace, lastBrace + 1)
    const parsed = JSON.parse(jsonStr)

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return { data: null, debug: 'items 배열 없음. 파싱된 키: ' + Object.keys(parsed).join(', ') }
    }

    return { data: parsed, debug: null }
  } catch (e) {
    return { data: null, debug: '파싱 오류: ' + e.message + '\n\n원본 시작 부분:\n' + text.substring(0, 300) }
  }
}

function App() {
  const [ingredients, setIngredients] = useState('')
  const [result, setResult] = useState(null)
  const [rawResult, setRawResult] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState(null)
  const [analyzedText, setAnalyzedText] = useState('')
  const [busyOverlay, setBusyOverlay] = useState({ show: false, title: '', subtitle: '', step: 0, totalSteps: 0 })

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

  const showOverlay = (title, subtitle, step, totalSteps) => {
    setBusyOverlay({ show: true, title, subtitle, step, totalSteps })
  }

  const hideOverlay = () => {
    setBusyOverlay({ show: false, title: '', subtitle: '', step: 0, totalSteps: 0 })
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

  const scanBarcode = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const imageData = e.target.result
        try {
          showOverlay('바코드 인식 중...', '사진 속 바코드를 읽고 있어요', 1, 3)
          const response = await fetch('https://ingredient-scanner-server.onrender.com/barcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData })
          })
          const data = await response.json()
          if (data.barcode) {
            await fetchProductByBarcode(data.barcode)
          } else {
            hideOverlay()
            setErrorMsg('바코드를 인식하지 못했어요. 바코드 아래 숫자가 선명하게 나오도록 다시 찍어주세요.')
          }
        } catch (error) {
          hideOverlay()
          setErrorMsg('바코드 인식 중 오류가 발생했어요. 다시 시도해주세요.')
        }
        resolve()
      }
      reader.readAsDataURL(file)
    })
  }

  const fetchProductByBarcode = async (barcode) => {
    const databases = [
      { name: 'Open Food Facts', url: `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, category: '식품' },
      { name: 'Open Beauty Facts', url: `https://world.openbeautyfacts.org/api/v0/product/${barcode}.json`, category: '화장품/세제' },
      { name: 'Open Product Facts', url: `https://world.openproductsfacts.org/api/v0/product/${barcode}.json`, category: '일반 제품' },
    ]

    for (const db of databases) {
      showOverlay('제품 정보 조회 중...', `${db.category} 데이터베이스 검색 중`, 2, 3)

      try {
        const response = await fetch(db.url)
        const data = await response.json()

        if (data.status === 1 && data.product) {
          const product = data.product
          const ingredientText = product.ingredients_text || product.ingredients_text_en || ''
          const productName = product.product_name || product.product_name_en || '알 수 없는 제품'

          if (ingredientText) {
            setIngredients(ingredientText)
            showOverlay('성분 분석 준비 중...', `${productName} 성분을 가져왔어요`, 3, 3)
            await new Promise(r => setTimeout(r, 500))
            await analyzeIngredients(ingredientText, true)
            return
          }
        }
      } catch (err) {
        console.error(`${db.name} 조회 오류:`, err)
      }
    }

    hideOverlay()
    setErrorMsg('어느 데이터베이스에도 이 제품이 등록되어 있지 않아요. 성분표를 카메라로 직접 찍어주세요.')
  }

  const resetResults = () => {
    setIngredients('')
    setResult(null)
    setRawResult('')
    setErrorMsg('')
    setAnalyzedText('')
    hideOverlay()
  }

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    resetResults()

    showOverlay('성분표 읽는 중...', '이미지에서 텍스트를 추출하고 있어요', 1, 2)
    const text = await runOCR(file)
    setIngredients(text)

    if (text.trim()) {
      showOverlay('AI 분석 준비 중...', '성분 정보를 분석에 넘기고 있어요', 2, 2)
      await new Promise(r => setTimeout(r, 300))
    }
    hideOverlay()
    await analyzeIngredients(text)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    resetResults()

    showOverlay('성분표 읽는 중...', '이미지에서 텍스트를 추출하고 있어요', 1, 2)
    const text = await runOCR(file)
    setIngredients(text)

    if (text.trim()) {
      showOverlay('AI 분석 준비 중...', '성분 정보를 분석에 넘기고 있어요', 2, 2)
      await new Promise(r => setTimeout(r, 300))
    }
    hideOverlay()
    await analyzeIngredients(text)
  }

  const handleBarcodeCapture = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    resetResults()

    await scanBarcode(file)
  }

  const analyzeIngredients = async (text, skipOverlayHide = false) => {
    if (!text.trim()) {
      if (!skipOverlayHide) hideOverlay()
      return
    }
    setLoading(true)
    setResult(null)
    setRawResult('')
    setErrorMsg('')
    hideOverlay()

    try {
      const response = await fetch('https://ingredient-scanner-server.onrender.com/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: text })
      })

      const data = await response.json()
      setProgress(100)
      setTimeout(() => {
        if (data.error) {
          setErrorMsg(data.error)
        } else if (data.result) {
          const { data: parsed, debug } = parseAnalysisResult(data.result)
          if (parsed) {
            setResult(parsed)
            setAnalyzedText(text)
          } else {
            setRawResult('[디버그 정보]\n' + debug + '\n\n[원본 응답]\n' + data.result)
            setAnalyzedText(text)
          }
        }
        setLoading(false)
        setProgress(0)
      }, 300)
    } catch (error) {
      setErrorMsg('서버 연결에 실패했어요. 인터넷 연결을 확인하고 다시 시도해주세요.')
      setLoading(false)
      setProgress(0)
    }
  }

  const analyze = async () => {
    await analyzeIngredients(ingredients)
  }

  const isAnalyzed = (result || rawResult) && ingredients.trim() === analyzedText.trim()

  const counts = result ? {
    danger: result.items.filter(i => i.level === '위험').length,
    warning: result.items.filter(i => i.level === '주의').length,
    safe: result.items.filter(i => i.level === '안전').length,
    total: result.items.length,
  } : null

  // YouTube 검색 링크 생성
  const buildYouTubeSearchUrl = (query) => {
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query)
  }

  return (
    <div className="container">
      {loading && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {busyOverlay.show && (
        <div className="busy-overlay">
          <div className="busy-modal">
            <div className="busy-spinner-lg" />
            <h3 className="busy-title">{busyOverlay.title}</h3>
            <p className="busy-subtitle">{busyOverlay.subtitle}</p>
            {busyOverlay.totalSteps > 0 && (
              <div className="busy-steps">
                단계 {busyOverlay.step} / {busyOverlay.totalSteps}
              </div>
            )}
            <p className="busy-hint">잠시만 기다려주세요...</p>
          </div>
        </div>
      )}

      <div className="header">
        <div className="header-icon">
          <IconSearch />
        </div>
        <div>
          <h1 className="header-title">성분 스캐너</h1>
          <p className="header-subtitle">성분표를 입력하거나 사진을 올려주세요</p>
        </div>
      </div>

      <div className="card">
        <label className="label">사진 촬영 / 업로드</label>

        <div className="upload-buttons">
          <label className="button-webcam">
            <IconCamera />
            <span>카메라</span>
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={{ display: 'none' }} />
          </label>
          <label className="button-upload">
            <IconFolder />
            <span>사진 업로드</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          </label>
          <label className="button-webcam">
            <IconBarcode />
            <span>바코드</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleBarcodeCapture} style={{ display: 'none' }} />
          </label>
        </div>

        <div className="tip-box">
          <IconBulb />
          <div>
            <b>바코드 촬영 팁</b>: 바코드가 화면 가득 차도록, 아래 <b>숫자가 선명하게</b> 보이도록 찍어주세요.
          </div>
        </div>

        {preview && <img src={preview} alt="캡처된 이미지" className="preview-img" />}
      </div>

      <div className="card">
        <label className="label">성분표 입력</label>
        <textarea
          className="textarea"
          placeholder="여기에 성분표를 입력해주세요...&#10;(여러 줄 입력 가능)"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          disabled={loading}
        />
        <button
          className={`button ${loading ? 'button-loading' : ''}`}
          onClick={analyze}
          disabled={loading || busyOverlay.show || isAnalyzed}
          style={isAnalyzed ? { background: '#4caf50', color: '#fff', cursor: 'not-allowed' } : undefined}
        >
          {loading ? (
            <span className="loading-content">
              <span className="spinner" />
              {loadingMsg} ({progress}%)
            </span>
          ) : isAnalyzed ? (
            <><IconCheck /> 성분 분석 완료</>
          ) : (
            <><IconLeaf /> 성분 분석하기</>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="card">
          <div className="error-message">
            <strong>⚠️ 분석 중 오류가 발생했어요</strong><br />
            {errorMsg}<br /><br />
            잠시 후 <b>성분 분석하기</b> 버튼을 다시 눌러주세요.
          </div>
        </div>
      )}

      {result && counts && (
        <>
          <div className="card result-card">
            <div className="result-header">
              <span className="result-header-icon"><IconClipboard /></span>
              <h2 className="result-title">분석 결과</h2>
            </div>
            <p className="result-subtitle">총 {counts.total}개 성분 분석 완료</p>

            {/* 제품 카테고리 표시 */}
            {result.category && (
              <div className="category-badge">
                <span className="category-emoji">{getCategoryEmoji(result.product_type)}</span>
                <div>
                  <div className="category-label">추정 제품</div>
                  <div className="category-name">{result.category}</div>
                </div>
              </div>
            )}

            <div className="count-cards">
              <div className="count-card count-danger">
                <div className="count-card-label">위험 성분</div>
                <div className="count-card-number">{counts.danger}개</div>
              </div>
              <div className="count-card count-warning">
                <div className="count-card-label">주의 성분</div>
                <div className="count-card-number">{counts.warning}개</div>
              </div>
              <div className="count-card count-safe">
                <div className="count-card-label">안전 성분</div>
                <div className="count-card-number">{counts.safe}개</div>
              </div>
            </div>

            <div className="result-table-wrap">
              <table className="result-table">
                <thead>
                  <tr>
                    <th>성분명</th>
                    <th>위험도</th>
                    <th>설명</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td>
                        <span className={`level-badge level-${
                          item.level === '위험' ? 'danger' :
                          item.level === '주의' ? 'warning' : 'safe'
                        }`}>
                          {item.level}
                        </span>
                      </td>
                      <td>{item.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="result-disclaimer">
              * 본 결과는 참고용이며, 개인차가 있을 수 있습니다.
            </p>
          </div>

          {/* YouTube 검색 링크 카드 */}
          {result.youtube_searches && result.youtube_searches.length > 0 && (
            <div className="card youtube-card">
              <div className="result-header">
                <span className="result-header-icon youtube-icon-color"><IconPlay /></span>
                <h2 className="result-title">관련 YouTube 영상</h2>
              </div>
              <p className="result-subtitle">이 제품과 관련된 인기 영상을 찾아보세요</p>

              <div className="youtube-links">
                {result.youtube_searches.map((query, idx) => (
                  
                    key={idx}
                    href={buildYouTubeSearchUrl(query)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="youtube-link"
                  >
                    <span className="youtube-link-play"><IconPlay /></span>
                    <span className="youtube-link-text">{query}</span>
                    <span className="youtube-link-arrow"><IconExternal /></span>
                  </a>
                ))}
              </div>

              <p className="result-disclaimer">
                * 링크를 탭하면 YouTube에서 검색 결과가 열립니다.
              </p>
            </div>
          )}
        </>
      )}

      {!result && rawResult && (
        <div className="card result-card">
          <div className="result-header">
            <span className="result-header-icon"><IconClipboard /></span>
            <h2 className="result-title">분석 결과 (디버그 모드)</h2>
          </div>
          <div className="result-text">
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 14 }}>{rawResult}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default App