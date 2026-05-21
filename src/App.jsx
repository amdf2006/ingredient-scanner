.barcode-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 44px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.barcode-guide {
  width: 80%;
  height: 100px;
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-radius: 8px;
  position: relative;
}

.barcode-line {
  position: absolute;
  width: 80%;
  height: 2px;
  background: red;
  animation: scan-line 2s linear infinite;
}

@keyframes scan-line {
  0% { transform: translateY(-50px); }
  100% { transform: translateY(50px); }
}