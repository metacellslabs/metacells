class MatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Match.Error';
  }
}

export function check(value, pattern) {
  if (pattern === String) {
    if (typeof value !== 'string') {
      throw new MatchError(`Expected string, got ${typeof value}`);
    }
    return;
  }

  if (pattern === Number) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new MatchError(`Expected number, got ${typeof value}`);
    }
    return;
  }

  if (pattern === Boolean) {
    if (typeof value !== 'boolean') {
      throw new MatchError(`Expected boolean, got ${typeof value}`);
    }
    return;
  }

  if (pattern === Object) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new MatchError(`Expected plain object`);
    }
    return;
  }

  if (pattern === Function) {
    if (typeof value !== 'function') {
      throw new MatchError(`Expected function, got ${typeof value}`);
    }
    return;
  }

  if (Array.isArray(pattern)) {
    if (!Array.isArray(value)) {
      throw new MatchError(`Expected array, got ${typeof value}`);
    }
    if (pattern.length === 1) {
      value.forEach((item, i) => {
        try {
          check(item, pattern[0]);
        } catch (err) {
          throw new MatchError(`Array item [${i}]: ${err.message}`);
        }
      });
    }
    return;
  }

  if (pattern && typeof pattern === 'object') {
    if (pattern._matchType) {
      checkMatchPattern(value, pattern);
      return;
    }

    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new MatchError(`Expected object matching shape`);
    }

    for (const [key, subPattern] of Object.entries(pattern)) {
      if (subPattern && subPattern._matchType === 'optional' && value[key] === undefined) {
        continue;
      }
      if (subPattern && subPattern._matchType === 'maybe' && (value[key] === undefined || value[key] === null)) {
        continue;
      }
      try {
        check(value[key], subPattern);
      } catch (err) {
        throw new MatchError(`Key "${key}": ${err.message}`);
      }
    }
    return;
  }
}

function checkMatchPattern(value, pattern) {
  switch (pattern._matchType) {
    case 'maybe':
      if (value !== undefined && value !== null) {
        check(value, pattern.inner);
      }
      break;

    case 'optional':
      if (value !== undefined) {
        check(value, pattern.inner);
      }
      break;

    case 'oneOf': {
      let matched = false;
      for (const type of pattern.types) {
        try {
          check(value, type);
          matched = true;
          break;
        } catch (_) {
          // try next
        }
      }
      if (!matched) {
        throw new MatchError(`Value did not match any of the allowed types`);
      }
      break;
    }

    case 'objectIncluding':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new MatchError(`Expected object`);
      }
      if (pattern.shape) {
        for (const [key, subPattern] of Object.entries(pattern.shape)) {
          if (value[key] !== undefined) {
            check(value[key], subPattern);
          }
        }
      }
      break;

    case 'where':
      if (typeof pattern.fn === 'function') {
        try {
          const result = pattern.fn(value);
          if (result === false) {
            throw new MatchError(`Where check failed`);
          }
        } catch (err) {
          if (err instanceof MatchError) throw err;
          throw new MatchError(err.message || 'Where check failed');
        }
      }
      break;

    case 'any':
      break;

    default:
      break;
  }
}

export const Match = {
  Maybe: (inner) => ({ _matchType: 'maybe', inner }),
  Optional: (inner) => ({ _matchType: 'optional', inner }),
  OneOf: (...types) => ({ _matchType: 'oneOf', types }),
  ObjectIncluding: (shape) => ({ _matchType: 'objectIncluding', shape }),
  Where: (fn) => ({ _matchType: 'where', fn }),
  Any: { _matchType: 'any' },
  Error: MatchError,
};
