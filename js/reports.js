// Простые canvas-графики без библиотек. Подписи повёрнуты, значения компактные —
// наложений нет даже при многих точках.
function fmtShort(n) {
  n = Number(n) || 0;
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' млн';
  if (a >= 1e4) return (n / 1e3).toFixed(1).replace('.', ',') + ' тыс';
  if (a >= 1e3) return (n / 1e3).toFixed(2).replace('.', ',') + ' тыс';
  return String(Math.round(n));
}

function setupCanvas(canvas, cssHeight) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 640;
  canvas.width = W * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.height = cssHeight + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, cssHeight);
  ctx.font = '12px -apple-system, system-ui, sans-serif';
  return { ctx, W, H: cssHeight };
}

// Подписи оси X с поворотом 45°; skipEvery > 1 пропускает часть подписей.
function drawXLabels(ctx, labels, xs, yTop, skipEvery) {
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#86868b';
  labels.forEach((lab, i) => {
    if (skipEvery > 1 && i % skipEvery !== 0) return;
    ctx.save();
    ctx.translate(xs[i], yTop);
    ctx.rotate(-Math.PI / 4);
    const text = lab.length > 16 ? lab.slice(0, 15) + '…' : lab;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

function drawGrid(ctx, W, padL, padR, padT, plotH, max) {
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH * (1 - i / 4);
    ctx.strokeStyle = '#f0f0f2';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = '#86868b';
    ctx.fillText(fmtShort(max * i / 4), W - padR - 4, y - 7);
  }
}

function drawBars(canvas, labels, values, title) {
  const { ctx, W, H } = setupCanvas(canvas, 280);
  const padL = 8, padR = 8, padT = 30, padB = 62;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...values, 1) * 1.1;

  ctx.fillStyle = '#86868b';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, padL, 18);

  drawGrid(ctx, W, padL, padR, padT, plotH, max);

  const n = values.length;
  const iw = plotW / n;
  const needRotate = labels.some(l => l.length * 6.5 > iw * 0.9) || n > 7;
  const barW = Math.min(iw * 0.62, 46);
  const xs = values.map((_, i) => padL + i * iw + iw / 2);

  values.forEach((v, i) => {
    const bh = plotH * (v / max);
    const x = xs[i] - barW / 2, y = padT + plotH - bh;
    ctx.fillStyle = '#007aff';
    roundRect(ctx, x, y, barW, Math.max(bh, 2), 5);
    ctx.fill();
    ctx.fillStyle = '#1d1d1f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fmtShort(v), xs[i], y - 6);
  });

  if (needRotate) {
    const skip = Math.max(1, Math.ceil(n / Math.max(Math.floor(plotW / 52), 1)));
    drawXLabels(ctx, labels, xs, H - padB + 14, skip);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#86868b';
    labels.forEach((l, i) => ctx.fillText(l, xs[i], H - 12));
  }
}

function drawLine(canvas, labels, values, title) {
  const { ctx, W, H } = setupCanvas(canvas, 280);
  const padL = 8, padR = 14, padT = 30, padB = 62;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(...values, 1) * 1.15;

  ctx.fillStyle = '#86868b';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title, padL, 18);

  drawGrid(ctx, W, padL, padR, padT, plotH, max);

  const n = values.length;
  const step = plotW / Math.max(n - 1, 1);
  const xs = values.map((_, i) => padL + i * step);
  const ys = values.map(v => padT + plotH * (1 - v / max));

  // заливка под линией
  ctx.beginPath();
  ctx.moveTo(xs[0], padT + plotH);
  xs.forEach((x, i) => ctx.lineTo(x, ys[i]));
  ctx.lineTo(xs[n - 1], padT + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, 'rgba(0,122,255,.18)');
  grad.addColorStop(1, 'rgba(0,122,255,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = '#007aff';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  xs.forEach((x, i) => i ? ctx.lineTo(x, ys[i]) : ctx.moveTo(x, ys[i]));
  ctx.stroke();

  const skip = Math.max(1, Math.ceil(n / Math.max(Math.floor(plotW / 52), 1)));
  xs.forEach((x, i) => {
    ctx.beginPath();
    ctx.arc(x, ys[i], 3.5, 0, 7);
    ctx.fillStyle = '#007aff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (i % skip === 0) {
      ctx.fillStyle = '#1d1d1f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(fmtShort(values[i]), x, ys[i] - 10);
    }
  });

  drawXLabels(ctx, labels, xs, H - padB + 14, skip);
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
