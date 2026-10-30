// Owns nonogram state, geometry, drawing, exports, and canvas interaction logic.
import { getLayoutSettings, loadLayout, saveLayout, state } from './state.js';
import { clearSendQueue, scheduleSend } from './twitch-chat.js';
import { guardedExport } from './twitch-redeem.js';

let updateCanvasSizeRef;

const COL_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const CELL_EMPTY = 0;
const CELL_FILLED = 1;
const CELL_MARKED = 2;
// run_540p.py accepts at most 20 cells per chat message (fill + empty combined).
const MAX_CELLS_PER_MESSAGE = 20;

function colLetter(index) {
  return COL_LETTERS[index];
}

function coordFor(row, col) {
  return `${colLetter(col)}${row + 1}`;
}

function safeClipboardWrite(text) {
  try {
    navigator.clipboard.writeText(text);
  } catch (error) {
    console.warn('Clipboard write failed:', error);
    alert(text);
  }
}

export function configureNonogramGrid({ updateCanvasSize }) {
  updateCanvasSizeRef = updateCanvasSize;
}

export function initCells() {
  state.cellStates = Array.from({ length: state.size }, () => Array(state.size).fill(CELL_EMPTY));
  state.lastExported = new Set();
  state.lastExportedWhite = new Set();
  state.pendingCells = [];
  clearSendQueue();
  state.geometryCache = null;
  state.dirtyGrid = true;
  resetClueDashes();
  refreshExportButton();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export async function exportDartCommand() {
  let msg = '!darts';
  const chars = [...msg];
  chars[state.lastDartExportIndex] = chars[state.lastDartExportIndex].toUpperCase();
  msg = chars.join('');
  state.lastDartExportIndex++;
  if (state.lastDartExportIndex >= msg.length) {
    state.lastDartExportIndex = 1;
  }
  if (state.autosendEnabled) {
    scheduleSend(msg);
  } else {
    safeClipboardWrite(msg);
  }
}

function addColDash(col, pos, clueH) {
  if (col < 0 || col >= state.size) return;
  if (!Array.isArray(state.colDashes[col])) state.colDashes[col] = [];
  state.colDashes[col].push(clamp(pos, 0, clueH));
  state.dirtyGrid = true;
}

function removeNearestColDash(col, pos, threshold = 10) {
  const arr = state.colDashes[col];
  if (!arr || !arr.length) return;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - pos);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best !== -1 && bestDist <= threshold) {
    arr.splice(best, 1);
    state.dirtyGrid = true;
  }
}

function addRowDash(row, canvasX) {
  if (row < 0 || row >= state.size) return;
  if (!Array.isArray(state.rowDashes[row])) state.rowDashes[row] = [];
  state.rowDashes[row].push(canvasX);
  state.dirtyGrid = true;
}

function removeNearestRowDash(row, canvasX, threshold = 10) {
  const arr = state.rowDashes[row];
  if (!arr || !arr.length) return;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const d = Math.abs(arr[i] - canvasX);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  if (best !== -1 && bestDist <= threshold) {
    arr.splice(best, 1);
    state.dirtyGrid = true;
  }
}

export function computeGridGeometry() {
  const cacheKey = [
    state.size,
    state.colClueCount,
    state.fineTune,
    state.anchorX,
    state.anchorY,
    state.canvas?.width,
    state.canvas?.height
  ].join(':');

  if (state.geometryCache?.key === cacheKey) {
    return state.geometryCache.value;
  }

  state.ctx.font = 'bold 30px Arial';
  const clueW = state.ctx.measureText('0').width;
  const clueH = 30 * state.colClueCount + 5;

  const layout = getLayoutSettings(state.size, state.colClueCount);
  let cellSize;
  if (layout) {
    const defaultCellSize = layout.cellSize;
    cellSize = (defaultCellSize * state.size + state.fineTune) / state.size;
  } else {
    const gridSize = Math.min(state.canvas.width - clueW, state.canvas.height - clueH);
    cellSize = (gridSize + state.fineTune) / state.size;
  }

  const ox = state.canvas.width - cellSize * state.size - state.anchorX;
  const oy = state.canvas.height - cellSize * state.size - state.anchorY;

  const geometry = { clueW, clueH, cellSize, ox, oy };
  state.geometryCache = { key: cacheKey, value: geometry };
  return geometry;
}

function resetClueDashes() {
  state.rowDashes = Array.from({ length: state.size }, () => []);
  state.colDashes = Array.from({ length: state.size }, () => []);
}

export async function cleanAll() {
  return guardedExport(() => {
    initCells();
    createGrid();
    exportClearCommand();
  });
}

function sentValueFor(coord) {
  if (state.lastExported.has(coord)) return CELL_FILLED;
  if (state.lastExportedWhite.has(coord)) return CELL_MARKED;
  return CELL_EMPTY;
}

function markCellSent(coord, value) {
  if (value === CELL_FILLED) {
    state.lastExportedWhite.delete(coord);
    state.lastExported.add(coord);
  } else {
    state.lastExported.delete(coord);
    state.lastExportedWhite.add(coord);
  }
}

function pendingIndex(coord) {
  return state.pendingCells.findIndex(cell => cell.coord === coord);
}

export function refreshExportButton() {
  const btn = state.exportBtn;
  if (!btn) return;
  const waiting = state.pendingCells.length ? ` — ${state.pendingCells.length} waiting` : '';
  const verb = state.exportAction === 'clipboard' ? 'Copies' : 'Sends';
  const auto = state.autosendEnabled
    ? `Auto-sends every ${MAX_CELLS_PER_MESSAGE} selected cells. `
    : '';
  btn.dataset.baseTitle = `${auto}${verb} up to ${MAX_CELLS_PER_MESSAGE} cells per click${waiting}`;
  btn.title = btn.dataset.baseTitle;
}

export function queueCell(row, col, value) {
  const coord = coordFor(row, col);
  const idx = pendingIndex(coord);
  if (value === CELL_EMPTY) {
    // Erasing an unsent cell just removes it from the outgoing list.
    if (idx !== -1) state.pendingCells.splice(idx, 1);
    return;
  }
  if (sentValueFor(coord) === value) {
    if (idx !== -1) state.pendingCells.splice(idx, 1);
    return;
  }
  if (idx !== -1) {
    state.pendingCells[idx].value = value;
  } else {
    state.pendingCells.push({ coord, value });
  }
  maybeAutoSend();
}

function buildCellMessage(cells) {
  const fills = [];
  const empties = [];
  cells.forEach(({ coord, value }) => {
    if (value === CELL_FILLED) fills.push(coord);
    else if (value === CELL_MARKED) empties.push(coord);
  });
  const parts = [];
  if (fills.length) parts.push(`!fill ${fills.join(' ')}`);
  if (empties.length) parts.push(`!empty ${empties.join(' ')}`);
  return parts.join(' ');
}

function sendCellBlocks(cells) {
  if (!cells.length) return Promise.resolve();
  const messages = [];
  for (let i = 0; i < cells.length; i += MAX_CELLS_PER_MESSAGE) {
    const chunk = cells.slice(i, i + MAX_CELLS_PER_MESSAGE);
    const msg = buildCellMessage(chunk);
    if (!msg) continue;
    messages.push(msg);
    chunk.forEach(({ coord, value }) => markCellSent(coord, value));
  }
  if (!messages.length) return Promise.resolve();
  return guardedExport(() => {
    messages.forEach(msg => scheduleSend(msg));
  }).catch(error => console.error('Failed to send cell message:', error));
}

// Called whenever a cell changes: queues it and, with auto-send on, sends a
// message as soon as MAX_CELLS_PER_MESSAGE cells are waiting.
export function maybeAutoSend() {
  refreshExportButton();
  if (!state.autosendEnabled) return;
  if (state.pendingCells.length < MAX_CELLS_PER_MESSAGE) return;
  const cells = state.pendingCells.splice(0, MAX_CELLS_PER_MESSAGE);
  sendCellBlocks(cells);
  refreshExportButton();
}

// Unified export button: acts on the next block of MAX_CELLS_PER_MESSAGE cells
// only. Each click moves on to the following block ("send" mode posts it to
// chat, "clipboard" mode copies it so it can be pasted manually).
export function exportPendingCells() {
  if (!state.pendingCells.length) return Promise.resolve();
  const cells = state.pendingCells.splice(0, MAX_CELLS_PER_MESSAGE);
  refreshExportButton();
  if (state.exportAction === 'clipboard') {
    const msg = buildCellMessage(cells);
    if (!msg) return Promise.resolve();
    cells.forEach(({ coord, value }) => markCellSent(coord, value));
    return guardedExport(() => safeClipboardWrite(msg))
      .catch(error => console.error('Failed to copy cell message:', error));
  }
  return sendCellBlocks(cells);
}

// "Reset export": forget what was sent and queue the whole grid again. With
// auto-send on it is sent in blocks of MAX_CELLS_PER_MESSAGE right away;
// otherwise the Export button sends/copies one block per click.
export function resetExport() {
  state.lastExported.clear();
  state.lastExportedWhite.clear();
  state.pendingCells = [];
  const cells = [];
  state.cellStates.forEach((row, r) => {
    row.forEach((s, c) => {
      if (s === CELL_FILLED) cells.push({ coord: coordFor(r, c), value: CELL_FILLED });
      else if (s === CELL_MARKED) cells.push({ coord: coordFor(r, c), value: CELL_MARKED });
    });
  });
  state.pendingCells = cells;
  refreshExportButton();
  if (!state.autosendEnabled) return Promise.resolve();
  state.pendingCells = [];
  refreshExportButton();
  return sendCellBlocks(cells);
}

export function exportClearCommand() {
  const ranges = [];
  for (let c = 0; c < state.size; c++) {
    const col = colLetter(c);
    ranges.push(`${col}1-${col}${state.size}`);
  }
  const clearCmd = `!clear ${ranges.join(',')}`;
  safeClipboardWrite(clearCmd);
}

export function createGrid() {
  const { clueH, cellSize, ox, oy } = computeGridGeometry();

  if ((state.hoveredRow >= 0 && state.hoveredRow < state.size) || (state.hoveredCol >= 0 && state.hoveredCol < state.size)) {
    state.ctx.fillStyle = 'rgba(100, 150, 255, 0.25)';

    if (state.hoveredRow >= 0) {
      const y = oy + state.hoveredRow * cellSize;
      state.ctx.fillRect(ox, y, cellSize * state.size, cellSize);
      if (ox > 0) state.ctx.fillRect(0, y, ox, cellSize);
    }

    if (state.hoveredCol >= 0) {
      const x = ox + state.hoveredCol * cellSize;
      state.ctx.fillRect(x, oy, cellSize, cellSize * state.size);
      state.ctx.fillRect(x, oy - clueH, cellSize, clueH);
    }
  }

  const dashH = 3;

  {
    const dashW = cellSize / 3;
    state.ctx.fillStyle = '#ffeb3b';
    for (let c = 0; c < state.size; c++) {
      const colX = ox + c * cellSize + cellSize / 2;
      const baseY = oy - clueH;
      const list = state.colDashes[c] || [];
      for (const pos of list) {
        const y = clamp(baseY + pos - dashH / 2, baseY, oy - dashH);
        state.ctx.fillRect(colX - dashW / 2, y, dashW, dashH);
      }
    }
  }

  {
    const dashW = cellSize / 4;
    state.ctx.fillStyle = '#ffeb3b';
    for (let r = 0; r < state.size; r++) {
      const rowTop = oy + r * cellSize;
      const list = state.rowDashes[r] || [];
      for (const canvasX of list) {
        const xDraw = Math.max(0, Math.min(canvasX, ox));
        const yDash = rowTop + (cellSize - dashH) / 2;
        state.ctx.fillRect(xDraw - dashW / 2, yDash, dashW, dashH);
      }
    }
  }

  const filledColor = state.useBlueFill ? 'rgba(50, 50, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
  const markedColor = 'rgba(255, 255, 255, 0.6)';

  const gridRight = ox + state.size * cellSize;
  const gridBottom = oy + state.size * cellSize;

  state.ctx.strokeStyle = 'cyan';
  state.ctx.lineWidth = 1;
  state.ctx.beginPath();
  for (let i = 0; i <= state.size; i++) {
    const x = ox + i * cellSize;
    const y = oy + i * cellSize;
    state.ctx.moveTo(x, oy);
    state.ctx.lineTo(x, gridBottom);
    state.ctx.moveTo(ox, y);
    state.ctx.lineTo(gridRight, y);
  }
  state.ctx.stroke();

  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      const val = state.cellStates[r][c];
      if (val === CELL_EMPTY) continue;
      const x = ox + c * cellSize;
      const y = oy + r * cellSize;
      state.ctx.fillStyle = val === CELL_FILLED ? filledColor : markedColor;
      state.ctx.fillRect(x, y, cellSize, cellSize);
    }
  }
  state.dirtyGrid = false;
}

export function onCanvasMouseDown(e) {
  e.preventDefault();

  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const { clueH, cellSize, ox, oy } = computeGridGeometry();
  const yOverGrid = y >= oy && y < oy + state.size * cellSize;

  const inTopClues = x >= ox && x < ox + state.size * cellSize && y >= oy - clueH && y < oy;
  if (inTopClues) {
    const col = Math.floor((x - ox) / cellSize);
    if (col >= 0 && col < state.size) {
      const pos = y - (oy - clueH);
      if (e.button === 0) addColDash(col, pos, clueH);
      else if (e.button === 2) removeNearestColDash(col, pos, 10);
      createGrid();
      return;
    }
  }

  const inLeftClues = x < ox && yOverGrid;
  if (inLeftClues) {
    const row = Math.floor((y - oy) / cellSize);
    if (row >= 0 && row < state.size) {
      if (e.button === 0) addRowDash(row, x);
      else if (e.button === 2) removeNearestRowDash(row, x, 10);
      createGrid();
      return;
    }
  }

  const c = Math.floor((x - ox) / cellSize);
  const r = Math.floor((y - oy) / cellSize);

  if (r >= 0 && r < state.size && c >= 0 && c < state.size) {
    state.isMarking = true;
    state.markValue = e.button === 0 ? CELL_FILLED : CELL_MARKED;
    state.eraseMode = state.cellStates[r][c] === state.markValue;

    const prevValue = state.cellStates[r][c];
    const newValue = state.eraseMode ? CELL_EMPTY : state.markValue;
    state.cellStates[r][c] = newValue;
    state.currentAction = [{ row: r, col: c, previous: prevValue, newValue }];
    queueCell(r, c, newValue);
    createGrid();
  } else {
    state.isDragging = true;
    state.dragOffsetX = e.clientX - state.frame.offsetLeft;
    state.dragOffsetY = e.clientY - state.frame.offsetTop;
  }
}

export function onCanvasMouseMove(e) {
  const rect = state.canvas.getBoundingClientRect();
  const scaleX = state.canvas.width / rect.width;
  const scaleY = state.canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const { clueH, cellSize, ox, oy } = computeGridGeometry();
  const c = Math.floor((x - ox) / cellSize);
  const r = Math.floor((y - oy) / cellSize);

  let newRow = -1;
  let newCol = -1;

  const yOverGrid = y >= oy && y < oy + state.size * cellSize;
  if (yOverGrid) {
    const ry = Math.floor((y - oy) / cellSize);
    if (ry >= 0 && ry < state.size) newRow = ry;
  }

  const inTopClues = x >= ox && x < ox + state.size * cellSize && y >= oy - clueH && y < oy;
  if (inTopClues) {
    const col = Math.floor((x - ox) / cellSize);
    if (col >= 0 && col < state.size) newCol = col;
  }

  if (r >= 0 && r < state.size && c >= 0 && c < state.size) {
    newRow = r;
    newCol = c;
  }

  const hoverChanged = newRow !== state.hoveredRow || newCol !== state.hoveredCol;
  state.hoveredRow = newRow;
  state.hoveredCol = newCol;

  let cellChanged = false;
  if (state.isMarking && newRow >= 0 && newCol >= 0) {
    const targetValue = state.eraseMode ? CELL_EMPTY : state.markValue;
    if (state.cellStates[newRow][newCol] !== targetValue) {
      if (!state.currentAction) state.currentAction = [];
      state.currentAction.push({
        row: newRow,
        col: newCol,
        previous: state.cellStates[newRow][newCol],
        newValue: targetValue
      });
      state.cellStates[newRow][newCol] = targetValue;
      queueCell(newRow, newCol, targetValue);
      cellChanged = true;
    }
  }

  if (hoverChanged || cellChanged) {
    createGrid();
  }
}

export function undoLastAction() {
  if (!state.moveHistory.length) return;
  const lastAction = state.moveHistory.pop();
  lastAction.forEach(({ row, col, previous, newValue }) => {
    const coord = coordFor(row, col);
    if (newValue === CELL_FILLED) state.lastExported.delete(coord);
    if (newValue === CELL_MARKED) state.lastExportedWhite.delete(coord);
    const idx = pendingIndex(coord);
    if (idx !== -1) state.pendingCells.splice(idx, 1);
    state.cellStates[row][col] = previous;
    if ((previous === CELL_FILLED || previous === CELL_MARKED) && sentValueFor(coord) !== previous) {
      state.pendingCells.push({ coord, value: previous });
    }
  });
  refreshExportButton();
  createGrid();
}

export function decrementSize() {
  state.size = Math.max(1, state.size - 1);
  loadLayout();
  initCells();
  updateCanvasSizeRef();
}

export function incrementSize() {
  state.size++;
  loadLayout();
  initCells();
  updateCanvasSizeRef();
}

export function decrementCols() {
  state.colClueCount = Math.max(1, state.colClueCount - 1);
  loadLayout();
  initCells();
  updateCanvasSizeRef();
}

export function incrementCols() {
  state.colClueCount++;
  loadLayout();
  initCells();
  updateCanvasSizeRef();
}

export function decrementFineTune() {
  state.fineTune--;
  state.geometryCache = null;
  saveLayout();
  updateCanvasSizeRef();
}

export function incrementFineTune() {
  state.fineTune++;
  state.geometryCache = null;
  saveLayout();
  updateCanvasSizeRef();
}

export function resetSizeDefaults() {
  saveLayout();
  state.size = 4;
  state.colClueCount = 1;
  initCells();
  updateCanvasSizeRef();
}
