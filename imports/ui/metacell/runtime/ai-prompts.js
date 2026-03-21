export const AI_LIST_DELIMITER = '|||';

export function buildListSystemPrompt(count, delimiter = AI_LIST_DELIMITER) {
  return (
    'Return exactly ' +
    count +
    ' options for the user request as plain text. Separate each option with the delimiter ' +
    delimiter +
    ' and do not use that delimiter inside an option. No extra commentary.'
  );
}

export function buildTableSystemPrompt(colsLimit, rowsLimit) {
  var limitHint = '';
  if (colsLimit && rowsLimit) {
    limitHint =
      ' Use at most ' +
      colsLimit +
      ' columns and ' +
      rowsLimit +
      ' rows (excluding header separator row).';
  }
  return (
    'Return only a markdown table with a header row, a separator row, and data rows. No prose before or after.' +
    limitHint
  );
}
