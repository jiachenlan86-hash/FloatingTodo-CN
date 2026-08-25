'use strict';

const canvas = document.getElementById('screenCanvas');
const context = canvas.getContext('2d');
const selection = document.getElementById('selection');
const sizeLabel = document.getElementById('sizeLabel');
let image = null;
let start = null;
let current = null;
let dragging = false;

window.floatingTodo.capture.onInit((payload) => {
  image = new Image();
  image.onload = () => {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    context.drawImage(image, 0, 0);
  };
  image.src = payload.imageDataUrl;
});

function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

function updateSelection() {
  const rect = rectFromPoints(start, current);
  selection.classList.remove('hidden');
  selection.style.left = `${rect.x}px`;
  selection.style.top = `${rect.y}px`;
  selection.style.width = `${rect.width}px`;
  selection.style.height = `${rect.height}px`;
  sizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  return rect;
}

document.addEventListener('mousedown', (event) => {
  if (event.button !== 0 || !image) return;
  dragging = true;
  start = { x: event.clientX, y: event.clientY };
  current = start;
  document.querySelector('.dim').classList.add('hidden');
  updateSelection();
});

document.addEventListener('mousemove', (event) => {
  if (!dragging) return;
  current = { x: event.clientX, y: event.clientY };
  updateSelection();
});

document.addEventListener('mouseup', (event) => {
  if (!dragging) return;
  dragging = false;
  current = { x: event.clientX, y: event.clientY };
  const rect = updateSelection();
  if (rect.width < 8 || rect.height < 8) {
    selection.classList.add('hidden');
    document.querySelector('.dim').classList.remove('hidden');
    return;
  }

  const scaleX = canvas.width / window.innerWidth;
  const scaleY = canvas.height / window.innerHeight;
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(rect.width * scaleX));
  output.height = Math.max(1, Math.round(rect.height * scaleY));
  output.getContext('2d').drawImage(
    canvas,
    Math.round(rect.x * scaleX), Math.round(rect.y * scaleY), output.width, output.height,
    0, 0, output.width, output.height
  );
  window.floatingTodo.capture.selected(output.toDataURL('image/png'));
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.floatingTodo.capture.cancel();
});
