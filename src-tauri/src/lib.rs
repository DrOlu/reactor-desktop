use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

/// State for managing the RPC child process
pub struct RpcState {
    process: Arc<Mutex<Option<Child>>>,
    stdin_writer: Arc<Mutex<Option<std::process::ChildStdin>>>,
}

impl Default for RpcState {
    fn default() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            stdin_writer: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RpcStartOptions {
    /// Dev-mode only: path to the CLI JS file (e.g. "../coding-agent/dist/cli.js").
    /// When null/empty, the backend discovers the pi binary automatically.
    cli_path: Option<String>,
    cwd: String,
    provider: Option<String>,
    model: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
}

/// How the pi process was resolved
#[derive(Debug)]
enum PiProcess {
    /// Dev mode: node <script> --mode rpc
    DevNode { script: String },
    /// Production: standalone pi binary found on PATH
    PathBinary { path: std::path::PathBuf },
}

/// Discover the pi binary. Strategy:
/// 1. If cli_path is provided (dev mode), use node + script
/// 2. Try finding `pi` on PATH (globally installed CLI or standalone binary)
/// 3. Fail with actionable error
fn discover_pi(options: &RpcStartOptions) -> Result<PiProcess, String> {
    // Dev mode: cli_path explicitly provided
    if let Some(ref cli_path) = options.cli_path {
        if !cli_path.is_empty() {
            return Ok(PiProcess::DevNode {
                script: cli_path.clone(),
            });
        }
    }

    // Production: try finding `pi` on PATH
    if let Ok(path) = which::which("pi") {
        return Ok(PiProcess::PathBinary { path });
    }

    Err(
        "Could not find the pi CLI.\n\n\
         Install it with:\n  npm install -g @mariozechner/pi-coding-agent\n\n\
         Then restart the app."
            .to_string(),
    )
}

/// Build a Command for the discovered pi process
fn build_command(pi: &PiProcess, options: &RpcStartOptions) -> Command {
    let mut cmd = match pi {
        PiProcess::DevNode { script } => {
            let mut c = Command::new("node");
            c.arg(script);
            c
        }
        PiProcess::PathBinary { path } => Command::new(path),
    };

    cmd.arg("--mode").arg("rpc");

    if let Some(ref provider) = options.provider {
        cmd.arg("--provider").arg(provider);
    }
    if let Some(ref model) = options.model {
        cmd.arg("--model").arg(model);
    }

    cmd.current_dir(&options.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Merge environment variables
    if let Some(ref env) = options.env {
        for (key, value) in env {
            cmd.env(key, value);
        }
    }

    // On Windows, prevent console window from appearing
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    cmd
}

/// Start the pi coding agent in RPC mode as a child process.
/// Discovery order: dev cli_path -> sidecar -> PATH -> error.
#[tauri::command]
async fn rpc_start(
    app: AppHandle,
    state: tauri::State<'_, RpcState>,
    options: RpcStartOptions,
) -> Result<String, String> {
    // Kill existing process if any
    if let Ok(mut proc) = state.process.lock() {
        if let Some(mut child) = proc.take() {
            let _ = child.kill();
        }
    }

    let pi = discover_pi(&options)?;
    let discovery_label = format!("{:?}", pi);

    let mut cmd = build_command(&pi, &options);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn pi process ({:?}): {}", pi, e))?;

    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Store stdin writer for sending commands
    if let Ok(mut writer) = state.stdin_writer.lock() {
        *writer = Some(stdin);
    }

    // Store process handle
    if let Ok(mut proc) = state.process.lock() {
        *proc = Some(child);
    }

    // Spawn thread to read stdout and emit events to frontend
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let _ = app_handle.emit("rpc-event", &line);
                }
                Err(_) => break,
            }
        }
        let _ = app_handle.emit("rpc-closed", "process exited");
    });

    // Spawn thread to read stderr
    let app_handle_err = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let _ = app_handle_err.emit("rpc-stderr", &line);
                }
                Err(_) => break,
            }
        }
    });

    Ok(discovery_label)
}

/// Send a JSON command to the RPC process stdin
#[tauri::command]
async fn rpc_send(
    state: tauri::State<'_, RpcState>,
    command: String,
) -> Result<(), String> {
    if let Ok(mut writer) = state.stdin_writer.lock() {
        if let Some(ref mut stdin) = *writer {
            stdin
                .write_all(command.as_bytes())
                .map_err(|e| format!("Failed to write to stdin: {}", e))?;
            stdin
                .write_all(b"\n")
                .map_err(|e| format!("Failed to write newline: {}", e))?;
            stdin
                .flush()
                .map_err(|e| format!("Failed to flush stdin: {}", e))?;
            Ok(())
        } else {
            Err("RPC process not started".to_string())
        }
    } else {
        Err("Failed to acquire stdin lock".to_string())
    }
}

/// Stop the RPC process
#[tauri::command]
async fn rpc_stop(state: tauri::State<'_, RpcState>) -> Result<(), String> {
    // Drop stdin first to signal EOF
    if let Ok(mut writer) = state.stdin_writer.lock() {
        *writer = None;
    }

    // Kill process
    if let Ok(mut proc) = state.process.lock() {
        if let Some(mut child) = proc.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    Ok(())
}

/// Check if the RPC process is running
#[tauri::command]
async fn rpc_is_running(state: tauri::State<'_, RpcState>) -> Result<bool, String> {
    if let Ok(mut proc) = state.process.lock() {
        if let Some(ref mut child) = *proc {
            match child.try_wait() {
                Ok(None) => Ok(true),
                Ok(Some(_)) => Ok(false),
                Err(_) => Ok(false),
            }
        } else {
            Ok(false)
        }
    } else {
        Ok(false)
    }
}

/// Get the app's data directory for storing config/sessions
#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(RpcState::default())
        .invoke_handler(tauri::generate_handler![
            rpc_start,
            rpc_send,
            rpc_stop,
            rpc_is_running,
            get_app_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
