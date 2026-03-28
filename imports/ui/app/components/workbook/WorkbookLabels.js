export function getFormatLabel(format) {
  switch (String(format || 'text')) {
    case 'number':
      return 'Number';
    case 'number_0':
      return 'Number 0';
    case 'number_2':
      return 'Number 0.00';
    case 'percent':
      return 'Percent';
    case 'percent_2':
      return 'Percent 0.00%';
    case 'date':
      return 'Date';
    case 'currency_usd':
      return 'USD';
    case 'currency_eur':
      return 'EUR';
    case 'currency_gbp':
      return 'GBP';
    case 'text':
    default:
      return 'Text';
  }
}

export function getFontFamilyLabel(fontFamily) {
  switch (String(fontFamily || 'default')) {
    case 'sans':
      return 'Trebuchet MS';
    case 'serif':
      return 'Georgia';
    case 'mono':
      return 'SF Mono';
    case 'display':
      return 'Avenir Next';
    case 'default':
    default:
      return 'System UI';
  }
}
