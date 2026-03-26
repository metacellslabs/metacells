import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

function readLocationSnapshot() {
  return {
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
    hash: window.location.hash || '',
  };
}

function buildUrl(to) {
  if (typeof to === 'string') return to;
  if (!to || typeof to !== 'object') return '/';
  return `${String(to.pathname || '/')}${String(to.search || '')}${String(to.hash || '')}`;
}

export function matchPath(pattern, pathname) {
  var normalizedPattern = String(pattern || '');
  var normalizedPathname = String(pathname || '/');
  if (normalizedPattern === '*') {
    return {
      params: {},
      pathname: normalizedPathname,
      pattern: normalizedPattern,
    };
  }
  var patternSegments = normalizedPattern.split('/').filter(Boolean);
  var pathSegments = normalizedPathname.split('/').filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return null;
  var params = {};
  for (var i = 0; i < patternSegments.length; i += 1) {
    var patternSegment = patternSegments[i];
    var pathSegment = pathSegments[i];
    if (patternSegment.charAt(0) === ':') {
      params[patternSegment.slice(1)] = decodeURIComponent(pathSegment || '');
      continue;
    }
    if (patternSegment !== pathSegment) return null;
  }
  return { params: params, pathname: normalizedPathname, pattern: normalizedPattern };
}

const RouterContext = createContext(null);
const RouteMatchContext = createContext({});

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(() => readLocationSnapshot());

  useEffect(() => {
    const handlePopState = () => {
      setLocation(readLocationSnapshot());
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const value = useMemo(() => {
    return {
      location,
      navigate(to, options) {
        const nextUrl = buildUrl(to);
        const replace = !!(options && options.replace);
        const state = options && Object.prototype.hasOwnProperty.call(options, 'state')
          ? options.state
          : null;
        if (replace) {
          window.history.replaceState(state, '', nextUrl);
        } else {
          window.history.pushState(state, '', nextUrl);
        }
        setLocation(readLocationSnapshot());
      },
      createHref(to) {
        return buildUrl(to);
      },
    };
  }, [location]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouterContext() {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error('Router hooks require RouterProvider');
  }
  return value;
}

export function useLocation() {
  return useRouterContext().location;
}

export function useNavigate() {
  return useRouterContext().navigate;
}

export function useHref(to) {
  return useRouterContext().createHref(to);
}

export function useSearchParams() {
  var location = useLocation();
  var navigate = useNavigate();
  var searchParams = useMemo(function () {
    return new URLSearchParams(location.search || '');
  }, [location.search]);
  var setSearchParams = function (nextInit, options) {
    var nextParams =
      nextInit instanceof URLSearchParams
        ? new URLSearchParams(nextInit.toString())
        : new URLSearchParams(nextInit || '');
    navigate(
      {
        pathname: location.pathname || '/',
        search: nextParams.toString() ? '?' + nextParams.toString() : '',
        hash: location.hash || '',
      },
      options,
    );
  };
  return [searchParams, setSearchParams];
}

export function useSearchParam(name) {
  var key = String(name || '');
  var location = useLocation();
  var navigate = useNavigate();
  var value = useMemo(
    function () {
      if (!key) return '';
      return new URLSearchParams(location.search || '').get(key) || '';
    },
    [key, location.search],
  );
  var setValue = function (nextValue, options) {
    var nextParams = new URLSearchParams(location.search || '');
    var normalizedValue =
      nextValue === null || typeof nextValue === 'undefined'
        ? ''
        : String(nextValue);
    if (!normalizedValue) {
      nextParams.delete(key);
    } else {
      nextParams.set(key, normalizedValue);
    }
    navigate(
      {
        pathname: location.pathname || '/',
        search: nextParams.toString() ? '?' + nextParams.toString() : '',
        hash: location.hash || '',
      },
      options,
    );
  };
  return [value, setValue];
}

export function useParams(pattern) {
  var location = useLocation();
  var routeParams = useContext(RouteMatchContext);
  if (!pattern) return routeParams || {};
  var matched = matchPath(pattern, location.pathname || '/');
  return matched ? matched.params : {};
}

export function useRouteMatch(pattern) {
  var location = useLocation();
  return matchPath(pattern, location.pathname || '/');
}

export function Navigate({ to, replace = false, state = null }) {
  var navigate = useNavigate();
  useEffect(
    function () {
      navigate(to, { replace: replace, state: state });
    },
    [navigate, replace, state, to],
  );
  return null;
}

export function Route() {
  return null;
}

export function Routes({ children }) {
  var location = useLocation();
  var pathname = location.pathname || '/';
  var matchedElement = null;
  var matchedParams = {};
  var visitNode = function (child) {
    if (matchedElement || !isValidElement(child)) return;
    if (child.type === Fragment) {
      Children.forEach(child.props && child.props.children, visitNode);
      return;
    }
    var childProps = child.props || {};
    var path = childProps.path;
    if (typeof path !== 'string') return;
    var matched = matchPath(path, pathname);
    if (!matched) return;
    matchedElement = childProps.element || null;
    matchedParams = matched.params || {};
  };

  Children.forEach(children, visitNode);

  if (!matchedElement) return null;
  return (
    <RouteMatchContext.Provider value={matchedParams}>
      {matchedElement}
    </RouteMatchContext.Provider>
  );
}

export function Link({ to, onClick, children, ...props }) {
  const href = useHref(to);
  const navigate = useNavigate();

  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        if (typeof onClick === 'function') onClick(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey ||
          event.shiftKey ||
          props.target === '_blank'
        ) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
