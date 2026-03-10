// Description: Grid/table rendering, resizing, keyboard navigation, fill-handle support, and markdown cell display.
import { MIN_COL_WIDTH } from "./constants.js";

export class GridManager {
    constructor(tableElement, rows, cols, defaultColWidth, defaultRowHeight) {
        this.table = tableElement;
        this.rows = rows;
        this.cols = cols;
        this.defaultColWidth = defaultColWidth;
        this.defaultRowHeight = defaultRowHeight;

        this.buildGrid();
        this.fitRowHeaderColumnWidth();
    }

    buildGrid() {
        for (var i = 0; i < this.rows; i++) {
            var row = this.table.insertRow(-1);
            for (var j = 0; j < this.cols; j++) {
                var letter = String.fromCharCode("A".charCodeAt(0) + j - 1);
                row.insertCell(-1).innerHTML = i && j
                    ? "<div class='cell-output'></div><input id='" + letter + i + "'/><div class='cell-actions'><button type='button' class='cell-action' data-action='copy' title='Copy value'>⧉</button><button type='button' class='cell-action' data-action='fullscreen' title='Fullscreen'>⤢</button><button type='button' class='cell-action' data-action='run' title='Run formula'>▶</button></div><div class='fill-handle'></div>"
                    : i || letter;
            }
        }
    }

    getInputs() {
        return [].slice.call(this.table.querySelectorAll("input"));
    }

    fitRowHeaderColumnWidth() {
        if (!this.table || !this.table.rows || !this.table.rows.length) return;
        var maxLabel = String(Math.max(1, this.rows - 1));
        var digits = maxLabel.length;
        var width = Math.max(28, 10 + digits * 8);

        for (var r = 0; r < this.table.rows.length; r++) {
            var cell = this.table.rows[r].cells[0];
            if (!cell) continue;
            cell.style.width = width + "px";
            cell.style.minWidth = width + "px";
        }
    }

    setColumnWidth(colIndex, width) {
        var finalWidth = Math.max(MIN_COL_WIDTH, width);
        for (var r = 0; r < this.table.rows.length; r++) {
            this.table.rows[r].cells[colIndex].style.width = finalWidth + "px";
        }
        return finalWidth;
    }

    setRowHeight(rowIndex, height) {
        var finalHeight = Math.max(this.defaultRowHeight, height);
        var row = this.table.rows[rowIndex];
        for (var c = 0; c < row.cells.length; c++) {
            row.cells[c].style.height = finalHeight + "px";
        }
        return finalHeight;
    }

    applySavedSizes(getColumnWidth, getRowHeight) {
        for (var colIndex = 1; colIndex < this.table.rows[0].cells.length; colIndex++) {
            this.setColumnWidth(colIndex, this.defaultColWidth);
            var colWidth = getColumnWidth(colIndex);
            if (colWidth != null) this.setColumnWidth(colIndex, colWidth);
        }

        for (var rowIndex = 1; rowIndex < this.table.rows.length; rowIndex++) {
            this.setRowHeight(rowIndex, this.defaultRowHeight);
            var rowHeight = getRowHeight(rowIndex);
            if (rowHeight != null) this.setRowHeight(rowIndex, rowHeight);
        }

        this.updateTableSize();
    }

    resetColumnWidths(clearColumnWidth) {
        for (var colIndex = 1; colIndex < this.table.rows[0].cells.length; colIndex++) {
            clearColumnWidth(colIndex);
            this.setColumnWidth(colIndex, this.defaultColWidth);
        }
        this.updateTableSize();
    }

    installResizeHandles(onColumnResize, onRowResize) {
        var headerRow = this.table.rows[0];

        for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
            var colHeader = headerRow.cells[colIndex];
            colHeader.classList.add("col-header");

            var colHandle = document.createElement("div");
            colHandle.className = "col-resize-handle";
            colHeader.appendChild(colHandle);

            ((index) => {
                colHandle.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    var startX = e.clientX;
                    var startWidth = this.table.rows[0].cells[index].offsetWidth;

                    var onMove = (moveEvent) => {
                        var finalWidth = this.setColumnWidth(index, startWidth + (moveEvent.clientX - startX));
                        onColumnResize(index, finalWidth);
                        this.updateTableSize();
                    };

                    var onUp = () => {
                        document.removeEventListener("mousemove", onMove);
                        document.removeEventListener("mouseup", onUp);
                    };

                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                });
            })(colIndex);
        }

        for (var rowIndex = 1; rowIndex < this.table.rows.length; rowIndex++) {
            var rowHeader = this.table.rows[rowIndex].cells[0];
            rowHeader.classList.add("row-header");

            var rowHandle = document.createElement("div");
            rowHandle.className = "row-resize-handle";
            rowHeader.appendChild(rowHandle);

            ((index) => {
                rowHandle.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    var startY = e.clientY;
                    var startHeight = this.table.rows[index].offsetHeight;

                    var onMove = (moveEvent) => {
                        var finalHeight = this.setRowHeight(index, startHeight + (moveEvent.clientY - startY));
                        onRowResize(index, finalHeight);
                        this.updateTableSize();
                    };

                    var onUp = () => {
                        document.removeEventListener("mousemove", onMove);
                        document.removeEventListener("mouseup", onUp);
                    };

                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                });
            })(rowIndex);
        }
    }

    updateTableSize() {
        if (!this.table.rows.length) return;

        var totalWidth = 0;
        var headerRow = this.table.rows[0];
        for (var c = 0; c < headerRow.cells.length; c++) {
            totalWidth += headerRow.cells[c].offsetWidth;
        }

        var totalHeight = 0;
        for (var r = 0; r < this.table.rows.length; r++) {
            totalHeight += this.table.rows[r].offsetHeight;
        }

        this.table.style.width = totalWidth + "px";
        this.table.style.height = totalHeight + "px";
    }

    setEditing(input, editing) {
        input.classList.toggle("editing", editing);
        input.parentElement.classList.toggle("editing", editing);
    }

    focusCellByArrow(input, key) {
        var movement = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1]
        }[key];

        if (!movement) return false;

        var td = input.parentElement;
        var row = td.parentElement;
        var nextRowIndex = row.rowIndex + movement[0];
        var nextCellIndex = td.cellIndex + movement[1];

        if (nextRowIndex < 1 || nextCellIndex < 1) return true;
        if (nextRowIndex >= this.table.rows.length) return true;
        if (nextCellIndex >= this.table.rows[nextRowIndex].cells.length) return true;

        var nextInput = this.table.rows[nextRowIndex].cells[nextCellIndex].querySelector("input");
        if (nextInput) nextInput.focus();
        return true;
    }

    renderCellValue(input, value, isEditing, hasFormula, options) {
        if (!isEditing) input.value = value;
        input.parentElement.dataset.computedValue = value == null ? "" : String(value);

        var output = input.parentElement.querySelector(".cell-output");
        if (output) {
            output.classList.toggle("formula-value", !!hasFormula);
            output.classList.toggle("error-value", !!(options && options.error));
            var opts = options || {};
            if (opts.attachment) {
                output.innerHTML = this.renderAttachmentValue(opts.attachment);
            } else {
                output.innerHTML = opts.literal ? this.escapeHtml(value == null ? "" : value).replace(/\r\n?/g, "<br>") : this.renderMarkdown(value);
            }
        }
    }

    renderAttachmentValue(attachment) {
        var meta = attachment || {};
        var pending = !!meta.pending;
        var name = this.escapeHtml(String(meta.name || ""));
        var previewUrl = String(meta.previewUrl || "");
        var isImage = String(meta.type || "").toLowerCase().indexOf("image/") === 0 && !!previewUrl;
        if (pending) {
            return "<div class='attachment-chip pending full'><button type='button' class='attachment-select'>Choose file</button></div>";
        }
        return "<div class='attachment-chip" + (isImage ? " has-image-preview" : "") + "' data-full-name='" + (name || "Attached file") + "'>"
            + "<button type='button' class='attachment-select'>" + (name || "Attached file") + "</button>"
            + (isImage
                ? "<div class='attachment-image-preview'><img src='" + this.escapeHtml(previewUrl) + "' alt='" + (name || "Attached image") + "' /></div>"
                : "")
            + "<button type='button' class='attachment-remove' title='Remove attachment'>×</button></div>";
    }

    renderMarkdown(value) {
        var text = this.escapeHtml(value == null ? "" : value).replace(/\r\n?/g, "\n");
        var lines = text.split("\n");
        var blocks = [];

        for (var i = 0; i < lines.length; i++) {
            var header = lines[i];
            var separator = lines[i + 1];

            if (this.isMarkdownTableHeader(header, separator)) {
                var tableLines = [header];
                i += 2;
                while (i < lines.length && /\|/.test(lines[i])) {
                    tableLines.push(lines[i]);
                    i++;
                }
                i--;
                blocks.push(this.renderMarkdownTable(tableLines));
            } else {
                blocks.push(this.renderInlineMarkdown(header));
            }
        }

        return blocks.join("<br>");
    }

    isMarkdownTableHeader(headerLine, separatorLine) {
        if (!headerLine || !separatorLine) return false;
        if (!/\|/.test(headerLine)) return false;
        return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(separatorLine);
    }

    renderMarkdownTable(lines) {
        if (!lines.length) return "";

        var headerCells = this.parseTableRow(lines[0]);
        var bodyRows = [];

        for (var i = 1; i < lines.length; i++) {
            bodyRows.push(this.parseTableRow(lines[i]));
        }

        var thead = "<thead><tr>" + headerCells.map((cell) => "<th>" + this.renderInlineMarkdown(cell) + "</th>").join("") + "</tr></thead>";
        var tbody = "<tbody>" + bodyRows.map((row) => {
            return "<tr>" + row.map((cell) => "<td>" + this.renderInlineMarkdown(cell) + "</td>").join("") + "</tr>";
        }).join("") + "</tbody>";

        return "<table class='md-table'>" + thead + tbody + "</table>";
    }

    parseTableRow(line) {
        var normalized = String(line || "").trim();
        if (normalized.charAt(0) === "|") normalized = normalized.substring(1);
        if (normalized.charAt(normalized.length - 1) === "|") normalized = normalized.substring(0, normalized.length - 1);
        return normalized.split("|").map(function(cell) { return cell.trim(); });
    }

    renderInlineMarkdown(text) {
        var output = String(text || "");
        output = output.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
        output = output.replace(/^###\s+/, "");
        output = output.replace(/^##\s+/, "");
        output = output.replace(/^#\s+/, "");
        output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<a href='$2' target='_blank' rel='noopener noreferrer'>$1</a>");
        output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
        output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
        return output;
    }

    escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
}
