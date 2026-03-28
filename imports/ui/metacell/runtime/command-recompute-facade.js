export function runCommandRecompute(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || typeof app.computeAll !== 'function') return false;

  var execute = function () {
    var computeOptions =
      opts.computeOptions && typeof opts.computeOptions === 'object'
        ? opts.computeOptions
        : undefined;
    app.computeAll(computeOptions);
  };

  if (opts.defer === true && typeof setTimeout === 'function') {
    setTimeout(execute, Number(opts.delayMs) || 0);
    return true;
  }

  execute();
  return true;
}
