// Owns nonogram state, geometry, drawing, exports, and canvas interaction logic.
import { getLayoutSettings, loadLayout, saveLayout, state } from './state.js';
import { clearSendQueue, scheduleSend } from './twitch-chat.js';
import { guardedExport } from './twitch-redeem.js';

let updateCanvasSizeRef;

const COL_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const CELL_EMPTY = 0;
const CELL_FILLED = 1;
const CELL_MARKED = 2;
// Outgoing-only value: the cell was already announced to the bot as filled or
// empty and has since been erased locally, so the bot needs "!clear <cell>".
// The bot counts cleared cells towards its per-message limit too.
const CELL_CLEAR = 3;
// run_540p.py accepts at most 25 cells per chat message (fill, empty and clear
// combined — cleared cells count towards the limit too). Each message carries a
// random number of cells in this range so blocks are never a fixed size.
const BLOCK_MIN = 15;
const BLOCK_MAX = 24;

// Message length for the next block: a random count in [BLOCK_MIN, BLOCK_MAX],
// so blocks are never a fixed size (20, 20, 20 …) and no two messages repeat the
// same shape.
function randomBlockSize() {
  return BLOCK_MIN + Math.floor(Math.random() * (BLOCK_MAX - BLOCK_MIN + 1));
}

// With auto-send on, cells accumulate until this many are waiting; the target is
// re-drawn after every sent block, which is what keeps the sizes varied.
let autoBlockTarget = randomBlockSize();

function randomizeBlockTarget() {
  autoBlockTarget = randomBlockSize();
}

// Splits a batch into consecutive messages of random length. Only used when the
// batch is bigger than one message (a whole-grid send, for instance) — a batch
// that already fits is sent as-is, never cut in two.
function chunkCells(cells) {
  if (cells.length <= BLOCK_MAX) return [cells];
  const chunks = [];
  let i = 0;
  while (i < cells.length) {
    const remaining = cells.length - i;
    const size = remaining <= BLOCK_MAX ? remaining : randomBlockSize();
    chunks.push(cells.slice(i, i + size));
    i += size;
  }
  return chunks;
}

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
  randomizeBlockTarget();
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
    return;
  }
  state.lastExported.delete(coord);
  if (value === CELL_MARKED) state.lastExportedWhite.add(coord);
  else state.lastExportedWhite.delete(coord); // CELL_CLEAR: bot now has it blank
}

function pendingIndex(coord) {
  return state.pendingCells.findIndex(cell => cell.coord === coord);
}

// Reconciles the outgoing entry for one cell with its new local state, so each
// cell is queued at most once and always with its latest value:
//  - same as what the bot already knows -> nothing to send;
//  - erased cell the bot knows as filled/empty -> outgoing "!clear";
//  - filled/marked -> outgoing !fill / !empty.
// A pending entry that changes state is overwritten in place, which is why a
// clear that is turned back into a fill/empty is only sent once (final state).
// Returns true when state.pendingCells changed.
function applyPending(coord, value) {
  const idx = pendingIndex(coord);
  const sent = sentValueFor(coord);
  const outgoing = value === sent ? null : (value === CELL_EMPTY ? CELL_CLEAR : value);
  if (outgoing === null) {
    if (idx === -1) return false;
    state.pendingCells.splice(idx, 1);
    return true;
  }
  if (idx !== -1) {
    if (state.pendingCells[idx].value === outgoing) return false;
    state.pendingCells[idx].value = outgoing;
    return true;
  }
  state.pendingCells.push({ coord, value: outgoing });
  return true;
}

export function refreshExportButton() {
  const btn = state.exportBtn;
  if (!btn) return;
  const waiting = state.pendingCells.length ? ` — ${state.pendingCells.length} waiting` : '';
  const verb = state.exportAction === 'clipboard' ? 'Copies' : 'Sends';
  const auto = state.autosendEnabled
    ? `Auto-sends in blocks of ${BLOCK_MIN}–${BLOCK_MAX} selected cells. `
    : '';
  btn.dataset.baseTitle = `${auto}${verb} ${BLOCK_MIN}–${BLOCK_MAX} cells per click${waiting}`;
  btn.title = btn.dataset.baseTitle;
}

export function queueCell(row, col, value) {
  applyPending(coordFor(row, col), value);
  // Also refreshes the "waiting" count on the button.
  maybeAutoSend();
}

function buildCellMessage(cells) {
  const fills = [];
  const empties = [];
  const clears = [];
  cells.forEach(({ coord, value }) => {
    if (value === CELL_FILLED) fills.push(coord);
    else if (value === CELL_MARKED) empties.push(coord);
    else if (value === CELL_CLEAR) clears.push(coord);
  });
  const parts = [];
  if (fills.length) parts.push(`!fill ${fills.join(' ')}`);
  if (empties.length) parts.push(`!empty ${empties.join(' ')}`);
  if (clears.length) parts.push(`!clear ${clears.join(' ')}`);
  return parts.join(' ');
}

// Sends the given cells, splitting them into random-length messages only when
// the batch is larger than one message.
function sendCellBlocks(cells) {
  if (!cells.length) return Promise.resolve();
  const messages = [];
  chunkCells(cells).forEach(chunk => {
    const msg = buildCellMessage(chunk);
    if (!msg) return;
    messages.push(msg);
    chunk.forEach(({ coord, value }) => markCellSent(coord, value));
  });
  if (!messages.length) return Promise.resolve();
  return guardedExport(() => {
    messages.forEach(msg => scheduleSend(msg));
  }).catch(error => console.error('Failed to send cell message:', error));
}

// A finished grid has no untouched cells left: every cell is either filled or
// marked empty (unresolved cells stay CELL_EMPTY). The solving move then has to
// reach the bot right away, even when fewer than BLOCK_MIN cells are still
// waiting.
function gridIsSolved() {
  return state.cellStates.every(row =>
    row.every(value => value === CELL_FILLED || value === CELL_MARKED)
  );
}

// Called whenever a cell changes: queues it and, with auto-send on, sends a
// message once the random block target is reached — or straight away when that
// change completed the grid, which flushes the remaining cells as the final
// message.
export function maybeAutoSend() {
  refreshExportButton();
  if (!state.autosendEnabled) return;
  if (!state.pendingCells.length) return;
  const solved = gridIsSolved();
  if (!solved && state.pendingCells.length < autoBlockTarget) return;
  // Solved: send everything still waiting, split into blocks only if a large
  // grid somehow accumulated more than one message worth of cells.
  const cells = solved
    ? state.pendingCells.splice(0)
    : state.pendingCells.splice(0, autoBlockTarget);
  randomizeBlockTarget();
  sendCellBlocks(cells);
  refreshExportButton();
}

// Unified export button: acts on the next block of randomly chosen cells
// (BLOCK_MIN..BLOCK_MAX) only. Each click moves on to the following block
// ("send" mode posts it to chat, "clipboard" mode copies it so it can be pasted
// manually).
export function exportPendingCells() {
  if (!state.pendingCells.length) return Promise.resolve();
  const size = Math.min(state.pendingCells.length, randomBlockSize());
  const cells = state.pendingCells.splice(0, size);
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
// auto-send on it is sent in random-sized blocks right away; otherwise the
// Export button sends/copies one block per click.
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
  randomizeBlockTarget();
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
  lastAction.forEach(({ row, col, previous }) => {
    state.cellStates[row][col] = previous;
    // Same reconciliation as a normal edit: undo can also mean "clear the
    // cell again" if it had already been announced to the bot.
    applyPending(coordFor(row, col), previous);
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
