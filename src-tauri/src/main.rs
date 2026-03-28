use serde_json::json;
use std::{
  fs,
  io::{Read, Write},
  net::{TcpListener, TcpStream},
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::{Arc, Mutex},
  thread,
  time::{Duration, Instant},
};
use tauri::{Manager, RunEvent, WebviewWindow};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
struct RuntimeState {
  child: Mutex<Option<Child>>,
}

#[derive(Debug)]
struct LaunchTarget {
  app_url: String,
  child: Option<Child>,
}

#[derive(Clone, Debug)]
struct RuntimeManifest {
  backend_main: String,
  node_binary: String,
}

fn main() {
  let app = tauri::Builder::default()
    .manage(Arc::new(RuntimeState::default()))
    .setup(|app| {
      let window = app
        .get_webview_window("main")
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "main window missing"))?;
      let app_handle = app.handle().clone();
      let runtime_state = app.state::<Arc<RuntimeState>>().inner().clone();

      thread::spawn(move || {
        if let Err(error) = bootstrap_window(&app_handle, &window, &runtime_state) {
          let message = format!("Desktop startup failed\n\n{}", error);
          show_error(&window, &message);
        }
      });

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("failed to build MetaCells Tauri shell");

  app.run(run_cleanup);
}

fn run_cleanup(app: &tauri::AppHandle, event: RunEvent) {
  if let RunEvent::Exit = event {
    let state = app.state::<Arc<RuntimeState>>().inner().clone();
    let guard_result = state.child.lock();
    if let Ok(mut guard) = guard_result {
      if let Some(child) = guard.as_mut() {
        terminate_child(child);
      }
      *guard = None;
    }
  }
}

fn bootstrap_window(
  app: &tauri::AppHandle,
  window: &WebviewWindow,
  runtime_state: &Arc<RuntimeState>,
) -> Result<(), String> {
  write_bootstrap_log(app, "bootstrap_window.start");
  set_startup_detail(window, "Preparing desktop workspace...");

  let launch_target = resolve_launch_target(app, window)?;

  if let Some(child) = launch_target.child {
    let mut guard = runtime_state
      .child
      .lock()
      .map_err(|_| String::from("Failed to store backend process state"))?;
    *guard = Some(child);
  }

  set_startup_detail(window, "Opening MetaCells...");
  write_bootstrap_log(
    app,
    &format!("bootstrap_window.navigate {}", launch_target.app_url),
  );
  navigate_window(window, &launch_target.app_url)
}

fn resolve_launch_target(
  app: &tauri::AppHandle,
  window: &WebviewWindow,
) -> Result<LaunchTarget, String> {
  if cfg!(debug_assertions) {
    let external_url = std::env::var("METACELLS_DESKTOP_URL")
      .ok()
      .map(|value| value.trim().to_string())
      .filter(|value| !value.is_empty());
    if let Some(url) = external_url {
      write_bootstrap_log(app, &format!("resolve_launch_target.external_url {}", url));
      set_startup_detail(window, "Using external development server...");
      wait_for_http(&url, STARTUP_TIMEOUT)?;
      return Ok(LaunchTarget {
        app_url: url,
        child: None,
      });
    }
  }

  if cfg!(debug_assertions) {
    start_dev_backend(app, window)
  } else {
    start_bundled_backend(app, window)
  }
}

fn start_dev_backend(
  app: &tauri::AppHandle,
  window: &WebviewWindow,
) -> Result<LaunchTarget, String> {
  let project_root = current_project_root()?;
  let server_entry = project_root.join("server.js");
  if !server_entry.exists() {
    return Err(format!("Missing dev server entry: {}", server_entry.display()));
  }

  let app_port = get_free_port()?;
  let app_url = format!("http://127.0.0.1:{app_port}");
  let data_root = app_data_root(app)?;
  let logs_dir = data_root.join("logs");
  fs::create_dir_all(&logs_dir)
    .map_err(|error| format!("Failed to create logs dir: {error}"))?;
  let sqlite_path = data_root.join("metacells.db");
  let log_path = logs_dir.join("tauri-backend-dev.log");
  let node_binary = resolve_dev_node_binary();
  write_bootstrap_log(
    app,
    &format!(
      "start_dev_backend node={} server={} cwd={} url={} sqlite={} log={}",
      node_binary.display(),
      server_entry.display(),
      server_entry
        .parent()
        .map(|value| value.display().to_string())
        .unwrap_or_default(),
      app_url,
      sqlite_path.display(),
      log_path.display()
    ),
  );

  set_startup_detail(window, "Launching local backend...");
  let child = spawn_backend_process(
    &node_binary,
    &server_entry,
    server_entry
      .parent()
      .ok_or_else(|| String::from("Failed to resolve dev server directory"))?,
    &app_url,
    &sqlite_path,
    &log_path,
  )?;

  wait_for_http(&app_url, STARTUP_TIMEOUT)?;
  write_bootstrap_log(app, &format!("start_dev_backend.ready {}", app_url));

  Ok(LaunchTarget {
    app_url,
    child: Some(child),
  })
}

fn start_bundled_backend(
  app: &tauri::AppHandle,
  window: &WebviewWindow,
) -> Result<LaunchTarget, String> {
  let runtime_root = resource_runtime_root(app)?;
  let manifest = read_runtime_manifest(&runtime_root)?;
  let server_entry = runtime_root.join(&manifest.backend_main);
  let node_binary = runtime_root.join(&manifest.node_binary);

  if !server_entry.exists() {
    return Err(format!(
      "Bundled backend entry is missing: {}",
      server_entry.display()
    ));
  }
  if !node_binary.exists() {
    return Err(format!(
      "Bundled Node binary is missing: {}",
      node_binary.display()
    ));
  }

  let app_port = get_free_port()?;
  let app_url = format!("http://127.0.0.1:{app_port}");
  let data_root = app_data_root(app)?;
  let logs_dir = data_root.join("logs");
  fs::create_dir_all(&logs_dir)
    .map_err(|error| format!("Failed to create logs dir: {error}"))?;
  let sqlite_path = data_root.join("metacells.db");
  let log_path = logs_dir.join("tauri-backend.log");
  write_bootstrap_log(
    app,
    &format!(
      "start_bundled_backend node={} server={} cwd={} url={} sqlite={} log={}",
      node_binary.display(),
      server_entry.display(),
      server_entry
        .parent()
        .map(|value| value.display().to_string())
        .unwrap_or_default(),
      app_url,
      sqlite_path.display(),
      log_path.display()
    ),
  );

  set_startup_detail(window, "Launching bundled backend...");
  let child = spawn_backend_process(
    &node_binary,
    &server_entry,
    server_entry
      .parent()
      .ok_or_else(|| String::from("Failed to resolve bundled server directory"))?,
    &app_url,
    &sqlite_path,
    &log_path,
  )?;

  wait_for_http(&app_url, STARTUP_TIMEOUT)?;
  write_bootstrap_log(app, &format!("start_bundled_backend.ready {}", app_url));

  Ok(LaunchTarget {
    app_url,
    child: Some(child),
  })
}

fn current_project_root() -> Result<PathBuf, String> {
  let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  manifest_dir
    .parent()
    .map(Path::to_path_buf)
    .ok_or_else(|| String::from("Failed to resolve project root from CARGO_MANIFEST_DIR"))
}

fn app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let base_path = app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
  let path = if cfg!(debug_assertions) {
    base_path.join("dev-runtime")
  } else {
    base_path.join("desktop-runtime")
  };
  fs::create_dir_all(&path).map_err(|error| {
    format!(
      "Failed to create app data directory {}: {error}",
      path.display()
    )
  })?;
  Ok(path)
}

fn resource_runtime_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let resource_dir = app
    .path()
    .resource_dir()
    .map_err(|error| format!("Failed to resolve resource directory: {error}"))?;
  let candidates = [
    resource_dir.join("desktop-runtime"),
    resource_dir.join(".desktop-runtime"),
    resource_dir.join("_up_").join("desktop-runtime"),
    resource_dir.join("_up_").join(".desktop-runtime"),
  ];

  for candidate in candidates {
    if candidate.join("manifest.json").exists() {
      return Ok(candidate);
    }
  }

  Err(format!(
    "Failed to locate bundled desktop runtime under {}",
    resource_dir.display()
  ))
}

fn read_runtime_manifest(runtime_root: &Path) -> Result<RuntimeManifest, String> {
  let manifest_path = runtime_root.join("manifest.json");
  let manifest_text = fs::read_to_string(&manifest_path).map_err(|error| {
    format!(
      "Failed to read runtime manifest {}: {error}",
      manifest_path.display()
    )
  })?;
  let manifest_json: serde_json::Value =
    serde_json::from_str(&manifest_text).map_err(|error| {
      format!(
        "Failed to parse runtime manifest {}: {error}",
        manifest_path.display()
      )
    })?;

  let backend_main = manifest_json
    .get("backend")
    .and_then(|backend| backend.get("main"))
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .trim()
    .to_string();
  let node_binary = manifest_json
    .get("node")
    .and_then(|node| node.get("binary"))
    .and_then(|value| value.as_str())
    .unwrap_or("")
    .trim()
    .to_string();

  if backend_main.is_empty() {
    return Err(String::from("Runtime manifest is missing backend.main"));
  }
  if node_binary.is_empty() {
    return Err(String::from("Runtime manifest is missing node.binary"));
  }

  Ok(RuntimeManifest {
    backend_main,
    node_binary,
  })
}

fn resolve_dev_node_binary() -> PathBuf {
  std::env::var("METACELLS_NODE_BINARY")
    .ok()
    .filter(|value| !value.trim().is_empty())
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("node"))
}

fn spawn_backend_process(
  node_binary: &Path,
  server_entry: &Path,
  cwd: &Path,
  app_url: &str,
  sqlite_path: &Path,
  log_path: &Path,
) -> Result<Child, String> {
  let mut command = Command::new(node_binary);
  command.arg(server_entry);
  command.current_dir(cwd);
  command.env("PORT", app_url_port(app_url)?.to_string());
  command.env("SQLITE_PATH", sqlite_path);
  command.env("BIND_IP", "127.0.0.1");
  command.stdin(Stdio::null());

  let log_file = fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(log_path)
    .map_err(|error| format!("Failed to open log file {}: {error}", log_path.display()))?;
  let stderr_log = log_file
    .try_clone()
    .map_err(|error| format!("Failed to clone log file handle: {error}"))?;
  command.stdout(Stdio::from(log_file));
  command.stderr(Stdio::from(stderr_log));

  command
    .spawn()
    .map_err(|error| format!("Failed to spawn backend process {}: {error}", node_binary.display()))
}

fn app_url_port(app_url: &str) -> Result<u16, String> {
  let suffix = app_url
    .rsplit(':')
    .next()
    .ok_or_else(|| format!("Invalid app URL: {app_url}"))?;
  suffix
    .parse::<u16>()
    .map_err(|error| format!("Invalid app URL port in {app_url}: {error}"))
}

fn get_free_port() -> Result<u16, String> {
  let listener = TcpListener::bind("127.0.0.1:0")
    .map_err(|error| format!("Failed to allocate free port: {error}"))?;
  let port = listener
    .local_addr()
    .map_err(|error| format!("Failed to inspect free port: {error}"))?
    .port();
  drop(listener);
  Ok(port)
}

fn wait_for_http(url: &str, timeout: Duration) -> Result<(), String> {
  let deadline = Instant::now() + timeout;
  while Instant::now() < deadline {
    if probe_http(url).unwrap_or(false) {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(750));
  }
  Err(format!("Timed out waiting for {url}"))
}

fn probe_http(url: &str) -> Result<bool, String> {
  let (host, port, path) = parse_http_url(url)?;
  let mut stream = TcpStream::connect((host.as_str(), port)).map_err(|error| error.to_string())?;
  stream
    .set_read_timeout(Some(Duration::from_secs(1)))
    .map_err(|error| error.to_string())?;
  stream
    .set_write_timeout(Some(Duration::from_secs(1)))
    .map_err(|error| error.to_string())?;

  let request = format!(
    "GET {} HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
    path, host, port
  );
  stream
    .write_all(request.as_bytes())
    .map_err(|error| error.to_string())?;

  let mut response = String::new();
  stream
    .read_to_string(&mut response)
    .map_err(|error| error.to_string())?;
  let status_line = response.lines().next().unwrap_or("");
  Ok(status_line.contains(" 200 ") || status_line.contains(" 204 ") || status_line.contains(" 304 "))
}

fn parse_http_url(url: &str) -> Result<(String, u16, String), String> {
  let trimmed = url.trim();
  let without_scheme = trimmed
    .strip_prefix("http://")
    .ok_or_else(|| format!("Only http:// URLs are supported: {trimmed}"))?;
  let mut parts = without_scheme.splitn(2, '/');
  let host_port = parts.next().unwrap_or("");
  let path = format!("/{}", parts.next().unwrap_or(""));
  let mut host_port_parts = host_port.splitn(2, ':');
  let host = host_port_parts.next().unwrap_or("").trim().to_string();
  let port = host_port_parts
    .next()
    .unwrap_or("80")
    .parse::<u16>()
    .map_err(|error| format!("Invalid port in {trimmed}: {error}"))?;
  if host.is_empty() {
    return Err(format!("Invalid host in {trimmed}"));
  }
  Ok((host, port, path))
}

fn set_startup_detail(window: &WebviewWindow, detail: &str) {
  let script = format!(
    "if (window.__METACELLS_SET_DETAIL__) window.__METACELLS_SET_DETAIL__({});",
    json!(detail)
  );
  let _ = window.eval(&script);
}

fn navigate_window(window: &WebviewWindow, url: &str) -> Result<(), String> {
  window
    .eval(&format!("window.location.replace({});", json!(url)))
    .map_err(|error| format!("Failed to navigate to {url}: {error}"))
}

fn show_error(window: &WebviewWindow, message: &str) {
  let script = format!(
    "document.body.innerHTML = '<main><h1>MetaCells failed to start</h1><pre id=\"startup-error\"></pre></main>'; var output = document.getElementById('startup-error'); if (output) output.textContent = {};",
    json!(message)
  );
  let _ = window.eval(&script);
}

fn write_bootstrap_log(app: &tauri::AppHandle, line: &str) {
  let timestamp = chrono_like_now_iso();
  let message = format!("[{}] {}\n", timestamp, line);
  let logs_dir = app_data_root(app)
    .map(|path| path.join("logs"))
    .ok();
  let Some(logs_dir) = logs_dir else {
    return;
  };
  if fs::create_dir_all(&logs_dir).is_err() {
    return;
  }
  let log_path = logs_dir.join("desktop-bootstrap-tauri.log");
  let file_result = fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&log_path);
  let Ok(mut file) = file_result else {
    return;
  };
  let _ = file.write_all(message.as_bytes());
}

fn chrono_like_now_iso() -> String {
  let now = std::time::SystemTime::now();
  let datetime: chrono_stub::DateTime = now.into();
  datetime.to_iso_string()
}

mod chrono_stub {
  use std::time::{SystemTime, UNIX_EPOCH};

  pub struct DateTime {
    millis_since_epoch: u128,
  }

  impl From<SystemTime> for DateTime {
    fn from(value: SystemTime) -> Self {
      let millis_since_epoch = value
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
      Self { millis_since_epoch }
    }
  }

  impl DateTime {
    pub fn to_iso_string(&self) -> String {
      format!("{}ms", self.millis_since_epoch)
    }
  }
}

fn terminate_child(child: &mut Child) {
  if child.try_wait().ok().flatten().is_some() {
    return;
  }
  let _ = child.kill();
  let _ = child.wait();
}
