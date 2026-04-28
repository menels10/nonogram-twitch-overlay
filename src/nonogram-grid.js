// Owns nonogram state, geometry, drawing, exports, and canvas interaction logic.
import { getLayoutSettings, loadLayout, saveLayout, state } from './state.js';
import { scheduleSend } from './twitch-chat.js';
import { guardedExport } from './twitch-redeem.js';

let updateCanvasSizeRef;

export function configureNonogramGrid({ updateCanvasSize }) {
  updateCanvasSizeRef = updateCanvasSize;
}

export function initCells() {
  state.cellStates = Array.from({ length: state.size }, () => Array(state.size).fill(0));
  state.lastExported = new Set();
  state.lastExportedWhite = new Set();
  resetClueDashes();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export async function exportDartCommand() {
  let msg = '!darts';
  for (let i = 0; i < msg.length; i++) {
    if (i === state.lastDartExportIndex) {
      msg = msg.substring(0, i) + msg[i].toUpperCase() + msg.substring(i + 1);
      state.lastDartExportIndex++;
      if (state.lastDartExportIndex >= msg.length) {
        state.lastDartExportIndex = 1;
      }
      break;
    }
  }
  if (state.autosendEnabled) {
    scheduleSend(msg);
  } else {
    navigator.clipboard.writeText(msg);
  }
}

function addColDash(col, pos, clueH) {
  if (col < 0 || col >= state.size) return;
  if (!Array.isArray(state.colDashes[col])) state.colDashes[col] = [];
  state.colDashes[col].push(clamp(pos, 0, clueH));
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
  if (best !== -1 && bestDist <= threshold) arr.splice(best, 1);
}

function addRowDash(row, canvasX) {
  if (row < 0 || row >= state.size) return;
  if (!Array.isArray(state.rowDashes[row])) state.rowDashes[row] = [];
  state.rowDashes[row].push(canvasX);
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
  if (best !== -1 && bestDist <= threshold) arr.splice(best, 1);
}

export function computeGridGeometry() {
  state.ctx.font = 'bold 30px Arial';
  const clueW = state.ctx.measureText('0'.repeat(state.rowClueCount)).width;
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

  return { clueW, clueH, cellSize, ox, oy };
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

function exportCellsInner() {
  const coords = [];
  state.cellStates.forEach((row, r) => {
    row.forEach((s, c) => {
      if (s === 1) {
        const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
        if (!state.lastExported.has(coord)) {
          coords.push(coord);
          state.lastExported.add(coord);
        }
      }
    });
  });
  if (coords.length) {
    const msg = `!fill ${coords.join(' ')}`;
    if (state.autosendEnabled) {
      scheduleSend(msg);
    } else {
      navigator.clipboard.writeText(msg);
    }
  }
}

function exportAllCellsInner(mode) {
  state.lastExported.clear();
  state.lastExportedWhite.clear();

  if (!mode) return;

  const coords = [];
  if (mode === 'black') {
    state.cellStates.forEach((row, r) => {
      row.forEach((s, c) => {
        if (s === 1) {
          const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
          coords.push(coord);
          state.lastExported.add(coord);
        }
      });
    });
    if (coords.length) {
      const msg = `!fill ${coords.join(' ')}`;
      navigator.clipboard.writeText(msg);
      if (state.autosendEnabled) scheduleSend(msg);
    }
  } else if (mode === 'white') {
    state.cellStates.forEach((row, r) => {
      row.forEach((s, c) => {
        if (s === 2) {
          const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
          coords.push(coord);
          state.lastExportedWhite.add(coord);
        }
      });
    });
    if (coords.length) {
      const msg = `!empty ${coords.join(' ')}`;
      navigator.clipboard.writeText(msg);
      if (state.autosendEnabled) scheduleSend(msg);
    }
  }
}

function exportWhiteCellsInner() {
  const coords = [];
  state.cellStates.forEach((row, r) => {
    row.forEach((s, c) => {
      if (s === 2) {
        const coord = `${String.fromCharCode(97 + c)}${r + 1}`;
        if (!state.lastExportedWhite.has(coord)) {
          coords.push(coord);
          state.lastExportedWhite.add(coord);
        }
      }
    });
  });
  if (coords.length) {
    const msg = `!empty ${coords.join(' ')}`;
    if (state.autosendEnabled) {
      scheduleSend(msg);
    } else {
      navigator.clipboard.writeText(msg);
    }
  }
}

export function exportCells() {
  return guardedExport(exportCellsInner);
}

export function exportAllCells(mode) {
  return guardedExport(exportAllCellsInner, mode);
}

export function exportWhiteCells() {
  return guardedExport(exportWhiteCellsInner);
}

export function exportClearCommand() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const ranges = [];
  for (let c = 0; c < state.size; c++) {
    const col = letters[c];
    ranges.push(`${col}1-${col}${state.size}`);
  }
  const clearCmd = `!clear ${ranges.join(',')}`;
  try {
    navigator.clipboard.writeText(clearCmd);
  } catch (e) {
    console.warn('Clipboard write failed:', e);
    alert(clearCmd);
  }
}

export function createGrid() {
  const { clueH, cellSize, ox, oy } = computeGridGeometry();

  state.ctx.strokeStyle = 'cyan';
  state.ctx.lineWidth = 1;

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

  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      const x = ox + c * cellSize;
      const y = oy + r * cellSize;

      if (state.cellStates[r][c] === 1) {
        state.ctx.fillStyle = state.useBlueFill ? 'rgba(50, 50, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
      } else if (state.cellStates[r][c] === 2) {
        state.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      }

      state.ctx.strokeRect(x, y, cellSize, cellSize);
      if (state.cellStates[r][c] === 1 || state.cellStates[r][c] === 2) {
        state.ctx.fillRect(x, y, cellSize, cellSize);
        if (state.cellStates[r][c] === 2) state.ctx.fillStyle = 'black';
      }
    }
  }
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
    state.markValue = e.button === 0 ? 1 : 2;
    state.eraseMode = state.cellStates[r][c] === state.markValue;

    const prevValue = state.cellStates[r][c];
    const newValue = state.eraseMode ? 0 : state.markValue;
    state.cellStates[r][c] = newValue;
    state.currentAction = [{ row: r, col: c, previous: prevValue, newValue }];
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

  state.hoveredRow = newRow;
  state.hoveredCol = newCol;

  if (state.isMarking && newRow >= 0 && newCol >= 0) {
    const targetValue = state.eraseMode ? 0 : state.markValue;
    if (state.cellStates[newRow][newCol] !== targetValue) {
      if (!state.currentAction) state.currentAction = [];
      state.currentAction.push({
        row: newRow,
        col: newCol,
        previous: state.cellStates[newRow][newCol],
        newValue: targetValue
      });
      state.cellStates[newRow][newCol] = targetValue;
    }
  }

  createGrid();
}

export function undoLastAction() {
  if (!state.moveHistory.length) return;
  const lastAction = state.moveHistory.pop();
  lastAction.forEach(({ row, col, previous, newValue }) => {
    const coord = `${String.fromCharCode(97 + col)}${row + 1}`;
    if (newValue === 1) state.lastExported.delete(coord);
    if (newValue === 2) state.lastExportedWhite.delete(coord);
    state.cellStates[row][col] = previous;
  });
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
  saveLayout();
  updateCanvasSizeRef();
}

export function incrementFineTune() {
  state.fineTune++;
  saveLayout();
  updateCanvasSizeRef();
}

export function resetSizeDefaults() {
  saveLayout();
  state.size = 4;
  state.rowClueCount = 1;
  state.colClueCount = 1;
  initCells();
  updateCanvasSizeRef();
}
