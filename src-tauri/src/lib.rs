use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{
    LogicalPosition, LogicalSize, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSelection {
    text: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    source_pid: Option<i32>,
    can_replace: bool,
}

#[derive(Default)]
struct SelectorState {
    selection: Mutex<Option<DesktopSelection>>,
    last_status: Mutex<String>,
    watcher_running: Mutex<bool>,
    // True while the expanded tone/result panel is open. The background watcher
    // checks this and leaves the window completely alone so it never hides or
    // repositions the panel out from under the user.
    popup_open: Mutex<bool>,
}

struct SelectionProbe {
    selection: Option<DesktopSelection>,
    status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectorHealth {
    accessibility_allowed: bool,
    watcher_running: bool,
    status: String,
    has_selection: bool,
    can_replace: bool,
    selection_len: usize,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .manage(SelectorState::default())
        .invoke_handler(tauri::generate_handler![
            capture_selected_text,
            paste_text,
            paste_text_into_source,
            check_accessibility_permission,
            request_accessibility_permission,
            open_accessibility_settings,
            get_current_selection,
            get_selector_payload,
            get_selector_health,
            show_selector_window,
            expand_selector_window,
            hide_selector_window
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            // Rust owns window creation (the main window is no longer defined in
            // tauri.conf.json) so we can pick the correct URL per build profile.
            show_main_window(app.handle())?;
            ensure_selector_window(app.handle())?;
            start_selection_watcher(app.handle().clone());

            // Handle `huu://open?ticket=…` deep links from the "Open huumanity"
            // buttons on the post-sign-up / payment-success pages. We forward the
            // query string onto the editor URL so the web app can redeem the
            // one-time sign-in token and (if present) confirm the upgrade.
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    handle_deep_link(&handle, event.urls());
                });
                // Cold start: the app may have been launched *by* the deep link.
                if let Ok(Some(urls)) = app.deep_link().get_current() {
                    handle_deep_link(app.handle(), urls);
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = event {
                if let Err(err) = show_main_window(app) {
                    debug_log(&format!("show main window failed: {err}"));
                }
            }
        });
}

#[tauri::command]
fn capture_selected_text() -> Result<String, String> {
    let previous_clipboard = get_clipboard_text().unwrap_or_default();

    send_copy_shortcut()?;
    std::thread::sleep(std::time::Duration::from_millis(180));

    let selected_text = get_clipboard_text().unwrap_or_default();

    if !previous_clipboard.is_empty() {
        let _ = set_clipboard_text(previous_clipboard);
    }

    if selected_text.trim().is_empty() {
        return Err(
            "No selected text found. Select text in another app, then try again.".to_string(),
        );
    }

    Ok(selected_text)
}

#[tauri::command]
fn paste_text(text: String) -> Result<(), String> {
    set_clipboard_text(text)?;
    send_paste_shortcut()?;
    Ok(())
}

#[tauri::command]
fn paste_text_into_source(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
    text: String,
    source_pid: Option<i32>,
) -> Result<(), String> {
    if let Ok(mut open) = state.popup_open.lock() {
        *open = false;
    }
    if let Some(window) = app.get_webview_window("selector") {
        let _ = window.hide();
    }

    std::thread::sleep(Duration::from_millis(120));

    if let Some(pid) = source_pid {
        if let Err(err) = activate_source_process(pid) {
            debug_log(&format!("source activation failed pid={pid}: {err}"));
        } else {
            std::thread::sleep(Duration::from_millis(180));
        }
    }

    paste_text(text)
}

#[tauri::command]
fn check_accessibility_permission() -> bool {
    platform_accessibility_permission()
}

#[tauri::command]
fn request_accessibility_permission() -> bool {
    platform_request_accessibility_permission()
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Err("Accessibility setup is only available on macOS right now.".to_string());
    }

    Ok(())
}

#[tauri::command]
fn get_current_selection() -> Result<Option<DesktopSelection>, String> {
    platform_current_selection()
}

#[tauri::command]
fn get_selector_payload(
    state: State<'_, SelectorState>,
) -> Result<Option<DesktopSelection>, String> {
    state
        .selection
        .lock()
        .map(|selection| selection.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_selector_health(state: State<'_, SelectorState>) -> Result<SelectorHealth, String> {
    let probe = platform_current_selection_probe();
    let fallback_selection = state.selection.lock().map_err(|e| e.to_string())?.clone();
    let active_selection = probe.selection.clone().or(fallback_selection);

    if let Ok(mut last_status) = state.last_status.lock() {
        *last_status = probe.status.clone();
    }

    let watcher_running = *state.watcher_running.lock().map_err(|e| e.to_string())?;
    let selection_len = active_selection
        .as_ref()
        .map(|selection| selection.text.trim().len())
        .unwrap_or_default();
    let can_replace = active_selection
        .as_ref()
        .map(|selection| selection.can_replace)
        .unwrap_or(false);

    Ok(SelectorHealth {
        accessibility_allowed: platform_accessibility_permission(),
        watcher_running,
        status: probe.status,
        has_selection: selection_len > 0,
        can_replace,
        selection_len,
    })
}

#[tauri::command]
fn show_selector_window(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
    selection: DesktopSelection,
) -> Result<(), String> {
    show_selector_for_selection(&app, &state, selection)
}

fn show_selector_for_selection(
    app: &tauri::AppHandle,
    state: &SelectorState,
    selection: DesktopSelection,
) -> Result<(), String> {
    {
        let mut current = state.selection.lock().map_err(|e| e.to_string())?;
        *current = Some(selection.clone());
    }
    // Showing the small dot means the expanded panel is not open.
    if let Ok(mut open) = state.popup_open.lock() {
        *open = false;
    }

    let window = ensure_selector_window(app)?;
    let (x, y) = selector_button_position(app, &selection);
    let _ = window.eval("window.dispatchEvent(new CustomEvent('huu-selector-collapse'))");
    debug_log(&format!(
        "show selector text_len={} rect=({}, {}, {}, {}) pos=({}, {})",
        selection.text.len(),
        selection.x.round(),
        selection.y.round(),
        selection.width.round(),
        selection.height.round(),
        x,
        y
    ));

    window
        .set_size(LogicalSize::new(SELECTOR_DOT_SIZE, SELECTOR_DOT_SIZE))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x as f64, y as f64))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

/// Logical size of the collapsed floating dot window. ~the size of the macOS
/// cursor; leaves a few px of transparent padding around the 20px button for
/// its soft CSS shadow.
const SELECTOR_DOT_SIZE: f64 = 30.0;

fn selector_button_position(app: &tauri::AppHandle, selection: &DesktopSelection) -> (i32, i32) {
    // Exactly two allowed placements:
    //   PLAN A (default): just to the LEFT of the selection, vertically centered
    //                     on the first line of the selected text.
    //   PLAN B (fallback): if there isn't room on the left — the text hugs the
    //                     screen's left edge — sit ON TOP of the first word
    //                     (above the selection's start), never jammed over the
    //                     text against the margin.
    // We compute the WINDOW's top-left; the 20px button is centered inside the
    // 30px transparent window.
    let gap = 6.0;
    let is_point = selection.width <= 2.0 && selection.height <= 2.0;

    // Screen bounds in logical points.
    let (min_x, min_y, max_x, max_y) = if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let min_x = position.x as f64 / scale;
        let min_y = position.y as f64 / scale;
        (
            min_x,
            min_y,
            min_x + (size.width as f64 / scale) - (SELECTOR_DOT_SIZE + 4.0),
            min_y + (size.height as f64 / scale) - (SELECTOR_DOT_SIZE + 4.0),
        )
    } else {
        (0.0, 0.0, f64::MAX, f64::MAX)
    };

    // First-line height, capped so a tall multi-line selection still anchors the
    // dot to its TOP line rather than its vertical middle.
    let first_line = if is_point {
        SELECTOR_DOT_SIZE
    } else {
        selection.height.min(24.0)
    };
    let line_center_y = selection.y + (first_line / 2.0) - (SELECTOR_DOT_SIZE / 2.0);

    // Does the dot fit to the LEFT of the selection without running off-screen?
    let left_x = selection.x - SELECTOR_DOT_SIZE - gap;
    let room_on_left = left_x >= min_x + 4.0;

    let (mut x, mut y) = if room_on_left {
        // PLAN A — beside the words.
        (left_x, line_center_y)
    } else {
        // PLAN B — on top of the first word. Align to the selection's left edge
        // and lift above the first line. If that pushes off the top of the
        // screen, the clamp below tucks it to the top edge, still over the first
        // word.
        (selection.x, selection.y - SELECTOR_DOT_SIZE - gap)
    };

    // Final safety clamp so the window is always fully on-screen.
    x = x.clamp(min_x + 4.0, max_x.max(min_x + 4.0));
    y = y.clamp(min_y + 4.0, max_y.max(min_y + 4.0));

    (x.round() as i32, y.round() as i32)
}

/// Strong "this is not prose" signals: code, math, data, or design tokens.
/// Mirror of the TypeScript `looksLikeCodeOrData` (no regex — plain scanning).
fn looks_like_code_or_data(s: &str) -> bool {
    let non_space: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    if non_space.is_empty() {
        return true;
    }
    let len = non_space.chars().count() as f64;

    let digits = non_space.chars().filter(|c| c.is_ascii_digit()).count() as f64;
    let letters = non_space.chars().filter(|c| c.is_ascii_alphabetic()).count() as f64;
    let code_symbols = non_space
        .chars()
        .filter(|c| "{}[]()<>=+*/\\|^~%$@#_`".contains(*c))
        .count() as f64;

    // 1. symbol-dense → code / formula / design
    if code_symbols / len > 0.12 {
        return true;
    }
    // 2. digit-dense → number / calculation / data
    if digits / len > 0.30 {
        return true;
    }
    // 3. letter-sparse → not prose
    if letters / len < 0.45 {
        return true;
    }

    // 4. explicit code / markup token patterns
    let code_seqs = [
        "=>", "===", "!==", "==", "!=", "<=", ">=", "&&", "||", "::", "/>", "</", "/*", "*/",
    ];
    if code_seqs.iter().any(|seq| s.contains(seq)) {
        return true;
    }
    let st = s.trim();
    if st.ends_with(';') {
        return true;
    }
    if let Some(first) = st.chars().next() {
        if "{}[]".contains(first) {
            return true;
        }
    }
    if let Some(last) = st.chars().last() {
        if "{}[]".contains(last) {
            return true;
        }
    }
    // "<" immediately followed by a letter → markup tag open
    let chars: Vec<char> = s.chars().collect();
    for i in 0..chars.len().saturating_sub(1) {
        if chars[i] == '<' && chars[i + 1].is_ascii_alphabetic() {
            return true;
        }
    }
    // language keywords (word-boundary via alnum tokenization)
    let keywords = [
        "function", "const", "let", "var", "return", "import", "export", "class", "def",
        "public", "private", "static", "void", "null", "undefined", "async", "await", "elif",
        "println", "console", "printf",
    ];
    let lower = s.to_lowercase();
    if lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .any(|t| keywords.contains(&t))
    {
        return true;
    }

    // 5. arithmetic / equations: any "=", or "number op number"
    if s.contains('=') {
        return true;
    }
    let is_op = |c: char| "-+*/^×÷".contains(c);
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let mut j = i + 1;
            while j < chars.len() && chars[j] == ' ' {
                j += 1;
            }
            if j < chars.len() && is_op(chars[j]) {
                let mut k = j + 1;
                while k < chars.len() && chars[k] == ' ' {
                    k += 1;
                }
                if k < chars.len() && chars[k].is_ascii_digit() {
                    return true;
                }
            }
        }
        i += 1;
    }

    // 6. design tokens — hex colors
    for idx in 0..chars.len() {
        if chars[idx] == '#' {
            let mut j = idx + 1;
            while j < chars.len() && chars[j].is_ascii_hexdigit() {
                j += 1;
            }
            let hex_len = j - (idx + 1);
            let boundary = j >= chars.len() || !chars[j].is_alphanumeric();
            if (3..=8).contains(&hex_len) && boundary {
                return true;
            }
        }
    }
    // CSS units: number run then unit token
    let units = [
        "px", "rem", "em", "vh", "vw", "vmin", "vmax", "pt", "pc", "mm", "cm", "ch", "fr", "deg",
        "ms",
    ];
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i].is_ascii_digit() {
            let mut j = i;
            while j < chars.len() && (chars[j].is_ascii_digit() || chars[j] == '.') {
                j += 1;
            }
            let mut k = j;
            while k < chars.len() && chars[k].is_ascii_alphabetic() {
                k += 1;
            }
            if k > j {
                let unit: String = chars[j..k].iter().collect::<String>().to_lowercase();
                let boundary = k >= chars.len() || !chars[k].is_alphanumeric();
                if boundary && units.contains(&unit.as_str()) {
                    return true;
                }
            }
            i = j.max(i + 1);
        } else {
            i += 1;
        }
    }
    // color / transform functions: name immediately followed by "("
    let fns = [
        "rgb(", "rgba(", "hsl(", "hsla(", "hwb(", "var(", "calc(", "url(", "translate(",
        "translatex(", "translatey(", "rotate(", "scale(", "matrix(", "linear-gradient(",
        "radial-gradient(",
    ];
    if fns.iter().any(|f| lower.contains(f)) {
        return true;
    }

    false
}

/// Mirror of the TypeScript `isRephrashable` ground rule. The yellow button is
/// for rephrasing natural-language prose only — reject code, math, formulas,
/// numbers, data, and design tokens, plus single names/acronyms/stubs.
fn is_rephrashable(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    // Hard reject anything that reads as code / math / data / design.
    if looks_like_code_or_data(trimmed) {
        return false;
    }

    let words: Vec<&str> = trimmed.split_whitespace().collect();

    if words.len() == 1 {
        let word = words[0];
        let letters: String = word.chars().filter(|c| c.is_ascii_alphabetic()).collect();
        let letter_len = letters.chars().count();
        let word_len = word.chars().count();
        if letter_len < 3 {
            return false;
        }
        // Must be essentially all letters — rejects stubs like "v2", "px", "h1".
        if (letter_len as f64) / (word_len as f64) < 0.8 {
            return false;
        }
        // ALL-CAPS / acronym
        if letters == letters.to_uppercase() {
            return false;
        }
        // Proper noun / name / place
        if word.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
            return false;
        }
        return true;
    }

    // Multi-word: prose is letter-dominated …
    let non_space: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    if non_space.is_empty() {
        return false;
    }
    let letter_count = non_space.chars().filter(|c| c.is_ascii_alphabetic()).count();
    if (letter_count as f64) / (non_space.chars().count() as f64) < 0.55 {
        return false;
    }
    // … and needs at least two real alphabetic words (≥2 letters each).
    let wordy = words
        .iter()
        .filter(|w| w.chars().filter(|c| c.is_ascii_alphabetic()).count() >= 2)
        .count();
    wordy >= 2
}

/// Resolve the URL a Tauri window should load.
///
/// In a debug build we load from the local dev server / bundled export so the
/// `npm run tauri:dev` workflow keeps working. In a release build we load the
/// **live site** directly, so the desktop app is a thin native shell around
/// `https://huumanity.app` — Clerk login, Pro status, billing and every future
/// UI change work identically to the website with no rebuild required.
fn webview_url(path: &str) -> WebviewUrl {
    if cfg!(debug_assertions) {
        WebviewUrl::App(path.into())
    } else {
        let full = format!("https://huumanity.app{path}");
        WebviewUrl::External(full.parse().expect("valid huumanity.app url"))
    }
}

/// Forward an incoming `huu://open?…` deep link onto the editor, carrying its
/// query string (the sign-in `ticket` and optional `upgraded` flag) so the web
/// app can finish authenticating the desktop session.
fn handle_deep_link(app: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    let Some(url) = urls.into_iter().next() else {
        return;
    };
    let query = url.query().map(|q| format!("?{q}")).unwrap_or_default();

    let target = if cfg!(debug_assertions) {
        format!("http://localhost:3000/editor{query}")
    } else {
        format!("https://huumanity.app/editor{query}")
    };

    if let Err(err) = show_main_window(app) {
        debug_log(&format!("deep link: show main window failed: {err}"));
    }

    if let Some(window) = app.get_webview_window("main") {
        match target.parse::<tauri::Url>() {
            Ok(parsed) => {
                if let Err(err) = window.navigate(parsed) {
                    debug_log(&format!("deep link: navigate failed: {err}"));
                }
            }
            Err(err) => debug_log(&format!("deep link: bad target url: {err}")),
        }
    }
}

fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = if let Some(window) = app.get_webview_window("main") {
        window
    } else {
        WebviewWindowBuilder::new(app, "main", webview_url("/editor"))
            .title("")
            .inner_size(1200.0, 800.0)
            .min_inner_size(900.0, 600.0)
            .resizable(true)
            .build()
            .map_err(|e| e.to_string())?
    };

    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn expand_selector_window(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
) -> Result<(), String> {
    let selection = state
        .selection
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "No selected text available.".to_string())?;

    // The panel is now open — tell the watcher to hands-off until it closes.
    if let Ok(mut open) = state.popup_open.lock() {
        *open = true;
    }

    let window = ensure_selector_window(&app)?;
    // The window is a transparent canvas; the panel is anchored to its BOTTOM
    // edge (CSS justify-end). So we place the window's bottom just above the
    // selection and let the panel grow upward — that keeps it directly above
    // the text instead of floating hundreds of px overhead.
    let width = 460.0;
    let height = 260.0;
    let gap = 8.0;

    let mut x = selection.x + (selection.width / 2.0) - (width / 2.0);
    let mut y = selection.y - gap - height;

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let min_x = position.x as f64 / scale;
        let min_y = position.y as f64 / scale;
        let max_x = min_x + (size.width as f64 / scale) - width;
        x = x.clamp(min_x, max_x.max(min_x));
        // If there isn't room above (selection near the top), drop below it.
        if y < min_y {
            y = selection.y + selection.height.max(1.0) + gap;
        }
    } else {
        x = x.max(0.0);
        y = y.max(0.0);
    }

    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x.round(), y.round()))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_selector_window(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
) -> Result<(), String> {
    if let Ok(mut open) = state.popup_open.lock() {
        *open = false;
    }
    if let Some(window) = app.get_webview_window("selector") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ensure_selector_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("selector") {
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.set_always_on_top(true);
        return Ok(window);
    }

    WebviewWindowBuilder::new(app, "selector", webview_url("/selector"))
        .title("huu selector")
        .inner_size(SELECTOR_DOT_SIZE, SELECTOR_DOT_SIZE)
        .decorations(false)
        .transparent(true)
        // No native window drop-shadow — that soft square is what showed up as a
        // "frame / lines" around the circle. The button carries its own subtle
        // CSS shadow instead.
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .visible(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())
}

fn start_selection_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        // The selection is keyed by its TEXT (+ source app), never by screen
        // coordinates. This is the fix for the "button plays tag with the
        // cursor" bug: when an app doesn't expose selection bounds we fall back
        // to the pointer location, and if the key included coordinates every
        // mouse twitch would look like a brand-new selection and re-show / move
        // the button. Keying on text means the same highlighted phrase is the
        // same selection no matter where the mouse goes.
        let mut last_selection_key = String::new();
        let mut last_probe_status = String::new();
        // Consecutive polls the same text must persist before we show the dot.
        // At 200 ms/poll this is ~400 ms — long enough that we don't pop up
        // mid-drag, short enough to feel instant once the mouse is released.
        const STABLE_POLLS_REQUIRED: u32 = 2;
        let mut stable_count: u32 = 0;
        // Once the dot is shown for a selection we freeze it — no further
        // repositioning until the selection text actually changes.
        let mut shown_for_key = false;
        // The web/Electron accessibility tree FLICKERS: a poll mid-interaction
        // frequently returns "no selection" for a beat even though the text is
        // still highlighted. Hiding on the first miss is what made the dot
        // vanish/reappear and "play tag" (each recovery re-showed it at the new
        // cursor). So we only hide after several CONSECUTIVE misses.
        const MISSES_BEFORE_HIDE: u32 = 4;
        let mut miss_count: u32 = 0;

        let state = app.state::<SelectorState>();
        if let Ok(mut watcher_running) = state.watcher_running.lock() {
            *watcher_running = true;
        }

        debug_log("selection watcher started");

        loop {
            std::thread::sleep(Duration::from_millis(200));

            // Hands off entirely while the expanded panel is open — never hide
            // or move a panel the user is interacting with.
            if state.popup_open.lock().map(|open| *open).unwrap_or(false) {
                continue;
            }

            let probe = platform_current_selection_probe();
            if probe.status != last_probe_status {
                debug_log(&probe.status);
                if let Ok(mut last_status) = state.last_status.lock() {
                    *last_status = probe.status.clone();
                }
                last_probe_status = probe.status.clone();
            }

            // SELF-FOCUS: the user is interacting with our own dot/panel. Leave
            // the window EXACTLY as-is — don't hide, don't move, don't reset.
            // This is what lets the click actually land on the button instead of
            // the watcher yanking the window away.
            if probe.status == "huu-self-focused" {
                continue;
            }

            // Decide whether this poll yielded a rephrashable selection.
            let rephrashable = probe
                .selection
                .as_ref()
                .map(|s| {
                    let t = s.text.trim();
                    !t.is_empty() && is_rephrashable(t)
                })
                .unwrap_or(false);

            if !rephrashable {
                // A miss. Could be a genuine deselection OR just the web a11y
                // tree flickering. Only hide once we've missed several polls in
                // a row — a single dropout must NOT disturb the frozen dot.
                if shown_for_key || !last_selection_key.is_empty() {
                    miss_count += 1;
                    if miss_count >= MISSES_BEFORE_HIDE {
                        last_selection_key.clear();
                        stable_count = 0;
                        shown_for_key = false;
                        miss_count = 0;
                        if let Some(window) = app.get_webview_window("selector") {
                            let _ = window.hide();
                        }
                    }
                }
                continue;
            }

            // A hit — reset the miss debounce.
            miss_count = 0;

            let selection = probe.selection.expect("rephrashable implies Some");
            let trimmed = selection.text.trim().to_string();

            // Key on TEXT ONLY — deliberately NOT coordinates or pid. The same
            // highlighted phrase is the same selection no matter where the mouse
            // goes, so the dot never chases the cursor.
            let selection_key = trimmed.clone();

            if selection_key != last_selection_key {
                // A genuinely different selection — restart stability tracking.
                last_selection_key = selection_key;
                stable_count = 1;
                shown_for_key = false;
            } else if !shown_for_key {
                // Same text as last poll and not shown yet — count toward the
                // stability threshold, then show using the freshest coordinates
                // (the mouse has usually settled by now).
                stable_count += 1;

                if stable_count >= STABLE_POLLS_REQUIRED {
                    if let Err(err) = show_selector_for_selection(&app, &state, selection) {
                        debug_log(&format!("show selector failed: {err}"));
                    }
                    shown_for_key = true;
                }
            }
            // Same text and already shown → do nothing. The dot stays frozen in
            // place, so moving the cursor toward it can never make it flee.
        }
    });
}

fn debug_log(message: &str) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/huu-selector.log")
    {
        let _ = writeln!(file, "[{timestamp}] {message}");
    }
}

fn get_clipboard_text() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

fn set_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

fn send_copy_shortcut() -> Result<(), String> {
    send_shortcut("c")
}

fn send_paste_shortcut() -> Result<(), String> {
    send_shortcut("v")
}

#[cfg(target_os = "macos")]
fn activate_source_process(pid: i32) -> Result<(), String> {
    let script = format!(
    "tell application \"System Events\" to set frontmost of first application process whose unix id is {pid} to true"
  );
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err(format!("osascript exited with {status}"));
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn activate_source_process(_pid: i32) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn send_shortcut(key: &str) -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Meta, Direction::Press)
        .map_err(|e| e.to_string())?;
    enigo.text(key).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Meta, Direction::Release)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn platform_accessibility_permission() -> bool {
    macos_accessibility::is_trusted(false)
}

#[cfg(target_os = "macos")]
fn platform_request_accessibility_permission() -> bool {
    macos_accessibility::is_trusted(true)
}

#[cfg(not(target_os = "macos"))]
fn platform_accessibility_permission() -> bool {
    true
}

#[cfg(not(target_os = "macos"))]
fn platform_request_accessibility_permission() -> bool {
    true
}

#[cfg(target_os = "macos")]
fn platform_current_selection() -> Result<Option<DesktopSelection>, String> {
    Ok(platform_current_selection_probe().selection)
}

#[cfg(not(target_os = "macos"))]
fn platform_current_selection() -> Result<Option<DesktopSelection>, String> {
    Ok(None)
}

#[cfg(target_os = "macos")]
fn platform_current_selection_probe() -> SelectionProbe {
    macos_accessibility::current_selection_probe()
}

#[cfg(not(target_os = "macos"))]
fn platform_current_selection_probe() -> SelectionProbe {
    SelectionProbe {
        selection: None,
        status: "selector unavailable on this platform".to_string(),
    }
}

#[cfg(target_os = "macos")]
mod macos_accessibility {
    use std::sync::atomic::{AtomicI32, Ordering};
    use std::time::{Duration, Instant};
    use std::{ffi::c_void, ptr};

    use core_foundation::{
        array::{CFArray, CFArrayRef},
        base::{Boolean, CFRelease, CFType, CFTypeRef, TCFType},
        boolean::CFBoolean,
        dictionary::{CFDictionary, CFDictionaryRef},
        string::{CFString, CFStringRef},
    };
    use core_graphics::{
        event::CGEvent,
        event_source::{CGEventSource, CGEventSourceStateID},
        geometry::{CGPoint, CGRect, CGSize},
    };

    use super::{DesktopSelection, SelectionProbe};

    type AXUIElementRef = *const c_void;
    type AXValueRef = *const c_void;
    type AXError = i32;

    const AX_ERROR_SUCCESS: AXError = 0;
    const AX_VALUE_CG_RECT: i32 = 3;

    struct SelectionRead {
        text: String,
        rect: Option<CGRect>,
        can_replace: bool,
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> Boolean;
        fn AXUIElementCreateSystemWide() -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: *mut CFTypeRef,
        ) -> AXError;
        fn AXUIElementCopyParameterizedAttributeValue(
            element: AXUIElementRef,
            parameterized_attribute: CFStringRef,
            parameter: CFTypeRef,
            result: *mut CFTypeRef,
        ) -> AXError;
        fn AXUIElementGetPid(element: AXUIElementRef, pid: *mut i32) -> AXError;
        fn AXUIElementSetMessagingTimeout(
            element: AXUIElementRef,
            timeout_in_seconds: f32,
        ) -> AXError;
        fn AXUIElementSetAttributeValue(
            element: AXUIElementRef,
            attribute: CFStringRef,
            value: CFTypeRef,
        ) -> AXError;
        fn AXValueGetValue(value: AXValueRef, value_type: i32, value_ptr: *mut c_void) -> Boolean;
    }

    // Last app PID we flipped AXManualAccessibility on, so we only do it once per
    // app rather than every poll.
    static LAST_AX_APP_PID: AtomicI32 = AtomicI32::new(0);

    /// Chromium-based apps (Chrome, Edge, Brave) and Electron apps (Notion,
    /// Slack, VS Code, Discord, …) keep their accessibility tree — including
    /// `AXSelectedText` — switched off until an assistive client asks for it by
    /// setting `AXManualAccessibility` on the application element. Without this,
    /// the selector never sees selections in any of those apps. Best-effort and
    /// idempotent: unsupported apps just return an error we ignore.
    unsafe fn enable_focused_app_accessibility(system: AXUIElementRef) {
        let Some(app_el) = copy_attribute(system, "AXFocusedApplication") else {
            return;
        };

        if let Some(pid) = copy_element_pid(app_el as AXUIElementRef) {
            if LAST_AX_APP_PID.swap(pid, Ordering::Relaxed) != pid {
                let attr = CFString::new("AXManualAccessibility");
                let value = CFBoolean::true_value();
                AXUIElementSetAttributeValue(
                    app_el as AXUIElementRef,
                    attr.as_concrete_TypeRef(),
                    value.as_CFType().as_concrete_TypeRef(),
                );
            }
        }

        CFRelease(app_el);
    }

    pub fn is_trusted(prompt: bool) -> bool {
        if !prompt {
            return unsafe { AXIsProcessTrustedWithOptions(ptr::null()) != 0 };
        }

        let prompt_key = CFString::new("AXTrustedCheckOptionPrompt");
        let prompt_value = CFBoolean::true_value();
        let options =
            CFDictionary::from_CFType_pairs(&[(prompt_key.as_CFType(), prompt_value.as_CFType())]);
        unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) != 0 }
    }

    pub fn current_selection_probe() -> SelectionProbe {
        if !is_trusted(false) {
            return SelectionProbe {
                selection: None,
                status: "accessibility not trusted".to_string(),
            };
        }

        unsafe {
            let system = AXUIElementCreateSystemWide();
            if system.is_null() {
                return SelectionProbe {
                    selection: None,
                    status: "system accessibility element unavailable".to_string(),
                };
            }

            // CAP EVERY AX IPC CALL. Each AXUIElementCopy… is a synchronous
            // round-trip into the *other* app's process. With no timeout the
            // default is effectively unbounded, so one slow response from a
            // heavy page (e.g. a giant DOM) blocks this whole watcher thread for
            // many seconds — the real cause of "the button takes 30s to appear."
            // Set globally on the system-wide element (applies process-wide) so
            // every call below returns an error after 0.25s instead of hanging.
            AXUIElementSetMessagingTimeout(system, 0.25);

            // Unlock selection reporting in Chromium/Electron apps (Notion,
            // Chrome, Slack, …) before we read. Native apps are unaffected.
            enable_focused_app_accessibility(system);

            let focused = copy_focused_element(system);
            CFRelease(system as CFTypeRef);

            let Some(focused) = focused else {
                return SelectionProbe {
                    selection: None,
                    status: "focused text element unavailable".to_string(),
                };
            };

            let source_pid = copy_element_pid(focused as AXUIElementRef);

            // SELF-FOCUS GUARD. When the user clicks our yellow dot (or the
            // expanded panel), focus moves to huumanity itself. The watcher must
            // NOT read "no selection" and hide the dot out from under the click —
            // that's why clicking did nothing. Signal self-focus distinctly so
            // the watcher leaves the window exactly as-is.
            if source_pid == Some(std::process::id() as i32) {
                CFRelease(focused);
                return SelectionProbe {
                    selection: None,
                    status: "huu-self-focused".to_string(),
                };
            }

            // Hard wall on the whole tree walk. Even with a per-call timeout, a
            // wide tree could still chain many calls; this guarantees a single
            // poll never spends more than ~350ms searching before giving up and
            // trying again on the next tick. Combined with the 0.25s per-call
            // cap, the worst-case poll is well under a second — never 30.
            let deadline = Instant::now() + Duration::from_millis(350);
            let selection_read =
                find_selection_in_element_tree(focused as AXUIElementRef, 3, deadline);
            if selection_read.is_none() {
                CFRelease(focused);
                return SelectionProbe {
                    selection: None,
                    status: "focused element has no selected text".to_string(),
                };
            }

            CFRelease(focused);
            let selection_read = selection_read.unwrap();

            let rect = usable_rect(selection_read.rect).unwrap_or_else(pointer_fallback_rect);

            let selection = DesktopSelection {
                text: selection_read.text,
                x: rect.origin.x,
                y: rect.origin.y,
                width: rect.size.width,
                height: rect.size.height,
                source_pid,
                can_replace: selection_read.can_replace,
            };

            SelectionProbe {
                status: format!(
                    "selection found len={} can_replace={} rect=({}, {}, {}, {})",
                    selection.text.len(),
                    selection.can_replace,
                    selection.x.round(),
                    selection.y.round(),
                    selection.width.round(),
                    selection.height.round()
                ),
                selection: Some(selection),
            }
        }
    }

    unsafe fn copy_focused_element(system: AXUIElementRef) -> Option<CFTypeRef> {
        let focused_attr = CFString::new("AXFocusedUIElement");
        let mut focused: CFTypeRef = ptr::null();
        let focused_error =
            AXUIElementCopyAttributeValue(system, focused_attr.as_concrete_TypeRef(), &mut focused);

        if focused_error == AX_ERROR_SUCCESS && !focused.is_null() {
            return Some(focused);
        }

        let focused_app_attr = CFString::new("AXFocusedApplication");
        let mut focused_app: CFTypeRef = ptr::null();
        let app_error = AXUIElementCopyAttributeValue(
            system,
            focused_app_attr.as_concrete_TypeRef(),
            &mut focused_app,
        );

        if app_error != AX_ERROR_SUCCESS || focused_app.is_null() {
            return None;
        }

        let mut app_focused: CFTypeRef = ptr::null();
        let app_focused_error = AXUIElementCopyAttributeValue(
            focused_app as AXUIElementRef,
            focused_attr.as_concrete_TypeRef(),
            &mut app_focused,
        );

        if app_focused_error == AX_ERROR_SUCCESS && !app_focused.is_null() {
            CFRelease(focused_app);
            return Some(app_focused);
        }

        for window_attr in ["AXFocusedWindow", "AXMainWindow"] {
            if let Some(window) = copy_attribute(focused_app as AXUIElementRef, window_attr) {
                CFRelease(focused_app);
                return Some(window);
            }
        }

        CFRelease(focused_app);
        None
    }

    unsafe fn find_selection_in_element_tree(
        element: AXUIElementRef,
        remaining_depth: usize,
        deadline: Instant,
    ) -> Option<SelectionRead> {
        // Bail the instant we blow the time budget — keeps a single poll from
        // chaining dozens of (possibly slow) IPC calls deep into a big tree.
        if Instant::now() >= deadline {
            return None;
        }

        if let Some(selection) = read_selection_from_element(element) {
            return Some(selection);
        }

        if remaining_depth == 0 {
            return None;
        }

        for attr_name in ["AXFocusedUIElement", "AXParent"] {
            if Instant::now() >= deadline {
                return None;
            }
            if let Some(related) = copy_attribute(element, attr_name) {
                let selection = find_selection_in_element_tree(
                    related as AXUIElementRef,
                    remaining_depth - 1,
                    deadline,
                );
                CFRelease(related);
                if selection.is_some() {
                    return selection;
                }
            }
        }

        if let Some(children_ref) = copy_attribute(element, "AXChildren") {
            let children =
                CFArray::<*const c_void>::wrap_under_create_rule(children_ref as CFArrayRef);
            for child in children.get_all_values().into_iter().take(32) {
                if Instant::now() >= deadline {
                    return None;
                }
                if child.is_null() {
                    continue;
                }

                if let Some(selection) = find_selection_in_element_tree(
                    child as AXUIElementRef,
                    remaining_depth - 1,
                    deadline,
                ) {
                    return Some(selection);
                }
            }
        }

        None
    }

    unsafe fn read_selection_from_element(element: AXUIElementRef) -> Option<SelectionRead> {
        let text = copy_selected_text(element);
        if text.trim().is_empty() {
            return None;
        }

        let rect = copy_selection_rect(element);
        super::debug_log(&format!(
            "rect_lookup text_len={} rect={:?}",
            text.len(),
            rect.map(|r| (r.origin.x.round(), r.origin.y.round(), r.size.width.round(), r.size.height.round()))
        ));

        Some(SelectionRead {
            text,
            rect,
            can_replace: can_replace_selection(element),
        })
    }

    unsafe fn copy_attribute(element: AXUIElementRef, attr_name: &str) -> Option<CFTypeRef> {
        let attr = CFString::new(attr_name);
        let mut value: CFTypeRef = ptr::null();
        let error = AXUIElementCopyAttributeValue(element, attr.as_concrete_TypeRef(), &mut value);

        if error != AX_ERROR_SUCCESS || value.is_null() {
            return None;
        }

        Some(value)
    }

    unsafe fn copy_attribute_string(element: AXUIElementRef, attr_name: &str) -> Option<String> {
        let value = copy_attribute(element, attr_name)?;
        let cf_type = CFType::wrap_under_create_rule(value);
        cf_type
            .downcast::<CFString>()
            .map(|value| value.to_string())
    }

    unsafe fn copy_attribute_bool(element: AXUIElementRef, attr_name: &str) -> Option<bool> {
        let value = copy_attribute(element, attr_name)?;
        let cf_type = CFType::wrap_under_create_rule(value);
        cf_type.downcast::<CFBoolean>().map(bool::from)
    }

    unsafe fn can_replace_selection(element: AXUIElementRef) -> bool {
        if copy_attribute_bool(element, "AXEditable").unwrap_or(false) {
            return true;
        }

        let role = copy_attribute_string(element, "AXRole").unwrap_or_default();
        matches!(
            role.as_str(),
            "AXTextArea" | "AXTextField" | "AXComboBox" | "AXSearchField"
        )
    }

    unsafe fn copy_element_pid(element: AXUIElementRef) -> Option<i32> {
        let mut pid = 0;
        let error = AXUIElementGetPid(element, &mut pid);

        if error != AX_ERROR_SUCCESS || pid <= 0 {
            return None;
        }

        Some(pid)
    }

    fn usable_rect(rect: Option<CGRect>) -> Option<CGRect> {
        let rect = rect?;
        if rect.size.width <= 1.0 || rect.size.height <= 1.0 {
            return None;
        }

        Some(rect)
    }

    fn pointer_fallback_rect() -> CGRect {
        let point = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
            .ok()
            .and_then(|source| CGEvent::new(source).ok())
            .map(|event| event.location())
            .unwrap_or_else(|| CGPoint::new(24.0, 24.0));

        CGRect::new(&point, &CGSize::new(1.0, 1.0))
    }

    unsafe fn copy_selected_text(element: AXUIElementRef) -> String {
        let attr = CFString::new("AXSelectedText");
        let mut selected_text_ref: CFTypeRef = ptr::null();
        let error = AXUIElementCopyAttributeValue(
            element,
            attr.as_concrete_TypeRef(),
            &mut selected_text_ref,
        );

        if error != AX_ERROR_SUCCESS || selected_text_ref.is_null() {
            return String::new();
        }

        let selected_text = CFString::wrap_under_create_rule(selected_text_ref as CFStringRef);
        selected_text.to_string()
    }

    /// A rect we can actually anchor the button to: positive area, finite, and
    /// not absurdly large. This is the filter that rejects the degenerate
    /// `(0, 956, 0, 0)` empty-range rect web areas hand back when we ask the
    /// wrong way — accepting it was what dumped us onto the cursor fallback.
    fn is_real_rect(r: &CGRect) -> bool {
        r.origin.x.is_finite()
            && r.origin.y.is_finite()
            && r.size.width > 4.0
            && r.size.height > 4.0
            && r.size.width < 100_000.0
            && r.size.height < 100_000.0
    }

    unsafe fn copy_selection_rect(element: AXUIElementRef) -> Option<CGRect> {
        // Build the focused element + up to 8 ancestors. In web content the
        // geometry lives on the AXWebArea (an ancestor), so we must try the
        // whole chain — but we keep walking PAST any element that only offers a
        // degenerate/empty rect instead of stopping at the first non-null one.
        let mut chain: Vec<AXUIElementRef> = vec![element];
        let mut owned: Vec<CFTypeRef> = Vec::new();
        let mut current = element;
        for _ in 0..8 {
            let Some(parent_ref) = copy_attribute(current, "AXParent") else {
                break;
            };
            owned.push(parent_ref);
            current = parent_ref as AXUIElementRef;
            chain.push(current);
        }

        let mut found: Option<CGRect> = None;
        'outer: for (depth, el) in chain.iter().enumerate() {
            // Markers FIRST: in web content the selected-range path returns the
            // empty/garbage rect, while the marker range reflects the actual
            // highlighted text. Native fields have no markers and fall through
            // to the range path.
            for (label, rect) in [
                ("markers", rect_via_text_markers(*el)),
                ("range", rect_via_selected_range(*el)),
            ] {
                if let Some(r) = rect {
                    let real = is_real_rect(&r);
                    super::debug_log(&format!(
                        "  rect_try depth={depth} via={label} rect=({}, {}, {}, {}) real={real}",
                        r.origin.x.round(),
                        r.origin.y.round(),
                        r.size.width.round(),
                        r.size.height.round()
                    ));
                    if real {
                        found = Some(r);
                        break 'outer;
                    }
                }
            }
        }

        owned.iter().for_each(|r| CFRelease(*r));
        found
    }

    /// Pull a CGRect out of an AXValue, returning None if it isn't one.
    unsafe fn cg_rect_from_ax_value(value: CFTypeRef) -> Option<CGRect> {
        let mut rect = CGRect::new(&Default::default(), &Default::default());
        let did_read = AXValueGetValue(
            value as AXValueRef,
            AX_VALUE_CG_RECT,
            &mut rect as *mut CGRect as *mut c_void,
        );
        if did_read == 0 {
            None
        } else {
            Some(rect)
        }
    }

    /// Native text-field path: AXSelectedTextRange → AXBoundsForRange.
    unsafe fn rect_via_selected_range(element: AXUIElementRef) -> Option<CGRect> {
        let range_attr = CFString::new("AXSelectedTextRange");
        let mut range_ref: CFTypeRef = ptr::null();
        let range_error = AXUIElementCopyAttributeValue(
            element,
            range_attr.as_concrete_TypeRef(),
            &mut range_ref,
        );

        if range_error != AX_ERROR_SUCCESS || range_ref.is_null() {
            return None;
        }

        let bounds_attr = CFString::new("AXBoundsForRange");
        let mut bounds_ref: CFTypeRef = ptr::null();
        let bounds_error = AXUIElementCopyParameterizedAttributeValue(
            element,
            bounds_attr.as_concrete_TypeRef(),
            range_ref,
            &mut bounds_ref,
        );
        CFRelease(range_ref);

        if bounds_error != AX_ERROR_SUCCESS || bounds_ref.is_null() {
            return None;
        }

        let rect = cg_rect_from_ax_value(bounds_ref);
        CFRelease(bounds_ref);
        rect
    }

    /// Web-content path: AXSelectedTextMarkerRange → AXBoundsForTextMarkerRange.
    /// This is how Chromium/WebKit report selection geometry; for a multi-line
    /// selection it returns the union rect, whose left edge is the text column's
    /// start — exactly where we want the dot anchored.
    unsafe fn rect_via_text_markers(element: AXUIElementRef) -> Option<CGRect> {
        let marker_attr = CFString::new("AXSelectedTextMarkerRange");
        let mut marker_ref: CFTypeRef = ptr::null();
        let marker_error = AXUIElementCopyAttributeValue(
            element,
            marker_attr.as_concrete_TypeRef(),
            &mut marker_ref,
        );

        if marker_error != AX_ERROR_SUCCESS || marker_ref.is_null() {
            return None;
        }

        let bounds_attr = CFString::new("AXBoundsForTextMarkerRange");
        let mut bounds_ref: CFTypeRef = ptr::null();
        let bounds_error = AXUIElementCopyParameterizedAttributeValue(
            element,
            bounds_attr.as_concrete_TypeRef(),
            marker_ref,
            &mut bounds_ref,
        );
        CFRelease(marker_ref);

        if bounds_error != AX_ERROR_SUCCESS || bounds_ref.is_null() {
            return None;
        }

        let rect = cg_rect_from_ax_value(bounds_ref);
        CFRelease(bounds_ref);
        rect
    }
}

#[cfg(not(target_os = "macos"))]
fn send_shortcut(key: &str) -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| e.to_string())?;
    enigo.text(key).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|e| e.to_string())?;
    Ok(())
}
