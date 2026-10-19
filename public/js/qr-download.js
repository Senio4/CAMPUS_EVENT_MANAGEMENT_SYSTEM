// Download a QR <img> as a PNG file
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-download]');
  if (!btn) return;
  const img = document.getElementById(btn.getAttribute('data-download'));
  if (!img) return;
  const filename = btn.getAttribute('data-filename') || 'qr.png';
  try {
    const res = await fetch(img.src, { credentials: 'same-origin' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    window.open(img.src, '_blank');
  }
});