import { Fragment, useEffect } from 'react';
import { useCellContentState } from '../../../metacell/runtime/cell-content-store.js';

export function WorkbookCellContentLayer({ cellContentStore }) {
  const cellContentById = useCellContentState(cellContentStore);
  const cellIds = Object.keys(
    cellContentById && typeof cellContentById === 'object' ? cellContentById : {},
  );

  return (
    <Fragment>
      {cellIds.map((cellId) => {
        const entry = cellContentById[cellId];
        const input =
          typeof document !== 'undefined'
            ? document.getElementById(String(cellId || ''))
            : null;
        const cell = input && input.parentElement ? input.parentElement : null;
        if (!cell) return null;
        return <CellShellSync key={cellId} cell={cell} entry={entry} />;
      })}
    </Fragment>
  );
}

function ensureShellTarget(cell) {
  if (!cell) return null;
  var target = cell.querySelector('.cell-react-shell');
  if (target) return target;
  target = document.createElement('div');
  target.className = 'cell-react-shell';

  var output = document.createElement('div');
  output.className = 'cell-output';
  target.appendChild(output);

  var status = document.createElement('div');
  status.className = 'cell-status';
  status.setAttribute('aria-hidden', 'true');
  target.appendChild(status);

  var schedule = document.createElement('div');
  schedule.className = 'cell-schedule-indicator';
  schedule.setAttribute('aria-hidden', 'true');
  target.appendChild(schedule);

  cell.insertBefore(target, cell.firstChild || null);
  return target;
}

function hasRenderableEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return !!(
    String(entry.html || '').trim() ||
    String(entry.statusHtml || '').trim() ||
    String(entry.scheduleHtml || '').trim() ||
    String(entry.statusTitle || '').trim() ||
    String(entry.scheduleTitle || '').trim() ||
    String(entry.cellBackgroundColor || '').trim() ||
    String(entry.outputBackgroundColor || '').trim() ||
    String(entry.outputFontSize || '').trim() ||
    String(entry.outputFontFamily || '').trim() ||
    (Array.isArray(entry.cellClassNames) && entry.cellClassNames.length)
  );
}

function removeShellTarget(cell) {
  if (!cell) return;
  var target = cell.querySelector(':scope > .cell-react-shell');
  if (target && target.parentNode === cell) {
    target.parentNode.removeChild(target);
  }
}

function CellShellSync({ cell, entry }) {
  const shouldRender = hasRenderableEntry(entry);
  const shellTarget = shouldRender ? ensureShellTarget(cell) : null;
  const outputTarget = shellTarget ? shellTarget.querySelector('.cell-output') : null;
  const statusTarget = shellTarget ? shellTarget.querySelector('.cell-status') : null;
  const scheduleTarget = shellTarget
    ? shellTarget.querySelector('.cell-schedule-indicator')
    : null;

  useEffect(() => {
    if (shouldRender) return;
    removeShellTarget(cell);
  }, [cell, shouldRender]);

  useEffect(() => {
    return () => {
      removeShellTarget(cell);
    };
  }, [cell]);

  useEffect(() => {
    if (!shouldRender) return;
    cell.style.setProperty(
      '--cell-bg',
      entry && entry.cellBackgroundColor ? entry.cellBackgroundColor : '#fff',
    );
  }, [cell, shouldRender, entry && entry.cellBackgroundColor]);

  useEffect(() => {
    if (!shellTarget) return;
    const shellClassName = [
      'cell-react-shell',
      ...(entry && Array.isArray(entry.cellClassNames) ? entry.cellClassNames : []),
    ]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
    shellTarget.className = shellClassName;
  }, [shellTarget, entry && entry.cellClassNames]);

  const outputClassName =
    entry && entry.outputClassName ? entry.outputClassName : 'cell-output';
  useEffect(() => {
    if (!outputTarget) return;
    outputTarget.className = outputClassName;
    outputTarget.style.backgroundColor =
      entry && entry.outputBackgroundColor ? entry.outputBackgroundColor : '';
    outputTarget.style.fontSize =
      entry && entry.outputFontSize ? entry.outputFontSize : '';
    outputTarget.style.fontFamily =
      entry && entry.outputFontFamily ? entry.outputFontFamily : '';
    outputTarget.innerHTML = entry && typeof entry.html === 'string' ? entry.html : '';
  }, [
    outputTarget,
    outputClassName,
    entry && entry.outputBackgroundColor,
    entry && entry.outputFontSize,
    entry && entry.outputFontFamily,
    entry && entry.html,
  ]);

  useEffect(() => {
    if (!statusTarget) return;
    statusTarget.className =
      entry && entry.statusClassName ? entry.statusClassName : 'cell-status';
    if (entry && entry.statusTitle) {
      statusTarget.setAttribute('title', entry.statusTitle);
    } else {
      statusTarget.removeAttribute('title');
    }
    statusTarget.innerHTML =
      entry && typeof entry.statusHtml === 'string' ? entry.statusHtml : '';
  }, [
    statusTarget,
    entry && entry.statusClassName,
    entry && entry.statusTitle,
    entry && entry.statusHtml,
  ]);

  useEffect(() => {
    if (!scheduleTarget) return;
    if (entry && entry.scheduleTitle) {
      scheduleTarget.setAttribute('title', entry.scheduleTitle);
    } else {
      scheduleTarget.removeAttribute('title');
    }
    scheduleTarget.innerHTML =
      entry && typeof entry.scheduleHtml === 'string' ? entry.scheduleHtml : '';
  }, [
    scheduleTarget,
    entry && entry.scheduleTitle,
    entry && entry.scheduleHtml,
  ]);

  return null;
}
