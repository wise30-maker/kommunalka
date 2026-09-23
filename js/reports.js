// Простые canvas-графики без библиотек.
function drawBars(canvas, labels, values, title) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 640, H = 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const padL = 60, padB = 30, padT = 30, padR = 10;
  const max = Math.max(...values, 1);
  ctx.fillStyle = '#94a3b8'; ctx.font = '13px system-ui';
  ctx.fillText(title, padL, 18);
  // ось Y
  ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.stroke();
  const iw = (W - padL - padR) / values.length;
  values.forEach((v, i) => {
    const bh = (H - padT - padB) * (v / max);
    const x = padL + i * iw + iw * 0.15, y = H - padB - bh, w = iw * 0.7;
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(x, y, w, bh);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.fillText(fmtMoney(v), x + w / 2, y - 5);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(labels[i], x + w / 2, H - 10);
  });
  ctx.textAlign = 'left';
}

function drawLine(canvas, labels, values, title) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 640, H = 260;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  const padL = 60, padB = 30, padT = 30, padR = 15;
  const max = Math.max(...values, 1);
  ctx.fillStyle = '#94a3b8'; ctx.font = '13px system-ui';
  ctx.fillText(title, padL, 18);
  ctx.strokeStyle = '#334155';
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB); ctx.stroke();
  const step = (W - padL - padR) / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => [padL + i * step, H - padB - (H - padT - padB) * (v / max)]);
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
  pts.forEach(([x, y], i) => {
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fillStyle = '#38bdf8'; ctx.fill();
    ctx.fillText(fmtMoney(values[i]), x, y - 8);
    ctx.fillStyle = '#94a3b8'; ctx.fillText(labels[i], x, H - 10);
    ctx.fillStyle = '#e2e8f0';
  });
  ctx.textAlign = 'left';
}
