use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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
    // When the selector panel was last shown or hidden. On macOS, hiding the
    // overlay while huu is the active app makes the OS fire a `Reopen` event
    // (active app, no visible windows) — which we must NOT treat like a real
    // dock-icon click, or clicking "Copy"/closing the panel would pop the editor
    // window into view. We suppress `Reopen`-driven window surfacing for a short
    // window after any selector activity. `None` until the first interaction.
    last_selector_activity: Mutex<Option<Instant>>,
    // The on-screen frame of the floating dot while it's shown, in logical
    // points: (x, y, w, h). The mouse-event tap uses this to tell a click ON the
    // dot apart from a click elsewhere (which dismisses it). None while hidden.
    dot_frame: Mutex<Option<(f64, f64, f64, f64)>>,
    // The latest short-lived Clerk session token, pushed by the authenticated
    // editor window. The selector overlay runs on `tauri://localhost` and cannot
    // send the Clerk cookie cross-origin to huumanity.app, so it attaches this
    // token as a `Bearer` header on its rewrite requests — without it, the API
    // sees an anonymous caller and never counts the rewrite against the user's
    // daily limit (the "rewrites never count / users abuse it" bug).
    session_token: Mutex<Option<String>>,
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
            open_input_monitoring_settings,
            get_current_selection,
            get_selector_payload,
            get_selector_health,
            show_selector_window,
            expand_selector_window,
            position_selector_panel,
            hide_selector_window,
            open_billing,
            set_session_token,
            get_session_token
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
                // Ignore the Reopen that macOS fires as a side effect of the
                // selector overlay hiding (e.g. clicking "Copy" or closing the
                // panel). Only a genuine dock-icon click — with no recent
                // selector activity — should surface the editor window.
                if selector_recently_active(&app.state::<SelectorState>()) {
                    debug_log("ignoring Reopen triggered by selector hide");
                } else if let Err(err) = show_main_window(app) {
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
fn open_input_monitoring_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        return Err("Input Monitoring setup is only available on macOS right now.".to_string());
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
    // On macOS the native mouse-up event tap (`start_selection_watcher`) is the
    // SOLE authority on when and where the dot appears. The web editor — which
    // in release loads the LIVE huumanity.app — historically also ran a 500ms JS
    // polling loop that called this command with the selection's raw top-left
    // bounds, which fought the native watcher and made the dot chase the cursor /
    // sit off the text line. Ignore those calls here so the native watcher wins
    // even before the deployed site drops that loop. (The internal
    // `show_selector_for_selection` the watcher uses is unaffected.)
    #[cfg(target_os = "macos")]
    {
        let _ = (&app, &state, &selection);
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        show_selector_for_selection(&app, &state, selection)
    }
}

/// Fade the selector out, then hide its window — so it never just blinks out of
/// existence. We add a CSS class the frontend animates (opacity → 0 over ~130ms),
/// wait for that to finish, then hide. The next show removes the class and plays
/// the pop-in (see `show_selector_for_selection`).
fn fade_and_hide_selector(window: &tauri::WebviewWindow) {
    let _ = window.eval("document.documentElement.classList.add('huu-hiding')");
    std::thread::sleep(Duration::from_millis(150));
    let _ = window.hide();
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
    let _ = window.eval(
        "document.documentElement.classList.remove('huu-hiding'); \
         window.dispatchEvent(new CustomEvent('huu-selector-collapse'))",
    );
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

    // Remember where the dot is so the mouse tap can tell a click ON it apart
    // from a click elsewhere.
    if let Ok(mut frame) = state.dot_frame.lock() {
        *frame = Some((x as f64, y as f64, SELECTOR_DOT_SIZE, SELECTOR_DOT_SIZE));
    }
    Ok(())
}

/// Logical size of the collapsed floating dot window. ~the size of the macOS
/// cursor; leaves a few px of transparent padding around the 20px button for
/// its soft CSS shadow.
const SELECTOR_DOT_SIZE: f64 = 30.0;

fn selector_button_position(app: &tauri::AppHandle, selection: &DesktopSelection) -> (i32, i32) {
    // Two anchor conventions:
    //   • POINT anchor (width/height ≈ 0, used on macOS): selection.x/y is already
    //     the exact desired CENTER of the dot — the macOS watcher computed it from
    //     the text endpoint, gap, and side. We just center the 30px window on it.
    //   • RECT anchor (width/height > 0, the non-macOS path): selection is the
    //     selection's bounding box; place the dot just past its END, on its first
    //     line.
    // We compute the WINDOW's top-left; the 20px button is centered in the 30px
    // transparent window.
    let half = SELECTOR_DOT_SIZE / 2.0;
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

    let (mut x, mut y) = if is_point {
        // Center the window on the supplied dot-center point.
        (selection.x - half, selection.y - half)
    } else {
        // Bounds anchor: just past the END of the selection, centered on its first
        // line.
        let gap = 8.0;
        let line = selection.height.min(24.0);
        (
            selection.x + selection.width + gap,
            selection.y + (line / 2.0) - half,
        )
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
    mark_selector_activity(&state);

    let window = ensure_selector_window(&app)?;
    // Provisional placement using a select-stage height estimate so the first
    // paint lands in roughly the right spot. The frontend measures the panel's
    // real rendered height the instant it renders (and again on every stage
    // change) and calls `position_selector_panel`, which places it exactly.
    place_selector_panel(&app, &window, &selection, SELECT_BAR_HEIGHT_EST)?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// Rough height of the collapsed select-stage tone bar (one row of pills). Used
/// only for the provisional first paint before the frontend reports the real
/// measured height.
const SELECT_BAR_HEIGHT_EST: f64 = 44.0;

/// Place the transparent selector window so its visible panel sits DIRECTLY ON
/// TOP of the selected text — the panel's bottom edge `gap` above the
/// selection's top edge — and never below it.
///
/// The window is sized to the panel's actual height (`panel_height`, measured by
/// the frontend) plus margins, instead of a fixed tall canvas. That is what lets
/// the bar fit above the selection even when the selection is high on screen:
/// a small window has room above almost anywhere, whereas a fixed 300px window
/// got shoved down by macOS and ended up covering or sitting below the text.
fn place_selector_panel(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    selection: &DesktopSelection,
    panel_height: f64,
) -> Result<(), String> {
    let width = 460.0;
    let gap = 8.0;
    // The panel is bottom-anchored in the window (CSS `justify-end`). `p-3` gives
    // 12px below it; we add 12px of empty window space above it so the drop
    // shadow isn't clipped.
    let bottom_pad = 12.0;
    let top_margin = 12.0;
    // Floor the height so the window is ALWAYS tall enough for the tallest stage
    // (the result view, ~230px). This guarantees the panel is never clipped at
    // the top — even if a stage-transition resize hasn't landed yet, which was
    // the "tone bar / result preview cut in half" bug. The panel is
    // bottom-anchored, so the extra height is just invisible transparent space
    // ABOVE the bar; the bar still hugs the selection.
    let panel_height = panel_height.clamp(MIN_PANEL_HEIGHT, 700.0);
    let window_height = panel_height + bottom_pad + top_margin;

    // Horizontally centered over the selection.
    let mut x = selection.x + (selection.width / 2.0) - (width / 2.0);
    // window_top so that: panel_bottom (= window_top + window_height - bottom_pad)
    // == selection.y - gap.
    let mut y = (selection.y - gap) - (window_height - bottom_pad);

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let min_x = position.x as f64 / scale;
        let min_y = position.y as f64 / scale;
        let max_x = min_x + (size.width as f64 / scale) - width;
        x = x.clamp(min_x, max_x.max(min_x));
        // If the selection is so near the top that the bar can't fully fit above
        // it, pin to the top edge (slight overlap) — we NEVER drop it below.
        if y < min_y {
            y = min_y;
        }
    } else {
        x = x.max(0.0);
        y = y.max(0.0);
    }

    debug_log(&format!(
        "place_panel panel_h={:.0} -> window={:.0}x{:.0} at ({:.0},{:.0}) sel.y={:.0}",
        panel_height,
        width,
        window_height,
        x.round(),
        y.round(),
        selection.y
    ));

    window
        .set_size(LogicalSize::new(width, window_height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x.round(), y.round()))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Minimum panel height we reserve window space for — large enough that the
/// tallest stage (the result preview) is never clipped at the top.
const MIN_PANEL_HEIGHT: f64 = 236.0;

/// Called by the frontend with the panel's real measured pixel height so we can
/// place it precisely above the selection for the current stage (select bar vs.
/// the taller result view).
#[tauri::command]
fn position_selector_panel(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
    panel_height: f64,
) -> Result<(), String> {
    let selection = state
        .selection
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "No selected text available.".to_string())?;
    let Some(window) = app.get_webview_window("selector") else {
        return Ok(());
    };
    place_selector_panel(&app, &window, &selection, panel_height)
}

/// Record that the selector overlay was just shown or hidden. Used to suppress
/// the macOS `Reopen`-driven editor pop-up that otherwise fires when the overlay
/// hides while huu is the active app (see the `RunEvent::Reopen` handler).
fn mark_selector_activity(state: &SelectorState) {
    if let Ok(mut at) = state.last_selector_activity.lock() {
        *at = Some(Instant::now());
    }
}

/// True if the selector was active within the last ~2s — i.e. a `Reopen` right
/// now is almost certainly an artifact of the overlay hiding, not a real dock
/// click, so we should not surface the editor window.
fn selector_recently_active(state: &SelectorState) -> bool {
    state
        .last_selector_activity
        .lock()
        .ok()
        .and_then(|at| *at)
        .map(|at| at.elapsed() < Duration::from_millis(2000))
        .unwrap_or(false)
}

#[tauri::command]
fn hide_selector_window(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
) -> Result<(), String> {
    if let Ok(mut open) = state.popup_open.lock() {
        *open = false;
    }
    if let Ok(mut frame) = state.dot_frame.lock() {
        *frame = None;
    }
    mark_selector_activity(&state);
    if let Some(window) = app.get_webview_window("selector") {
        fade_and_hide_selector(&window);
    }
    Ok(())
}

/// Open the editor's Plans & Billing screen from the selector. Called when the
/// user hits the daily rewrite limit and clicks "Upgrade to Pro" in the limit
/// panel. Brings the main editor window forward and navigates it to
/// `/editor?settings=billing`, which the editor reads to open the settings modal
/// on the billing tab — the same place the in-app upgrade buttons land. The
/// selector overlay is hidden so it doesn't linger over the editor.
#[tauri::command]
fn open_billing(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
) -> Result<(), String> {
    if let Ok(mut open) = state.popup_open.lock() {
        *open = false;
    }
    if let Some(selector) = app.get_webview_window("selector") {
        let _ = selector.hide();
    }

    show_main_window(&app)?;

    let target = if cfg!(debug_assertions) {
        "http://localhost:3000/editor?settings=billing".to_string()
    } else {
        "https://huumanity.app/editor?settings=billing".to_string()
    };
    if let Some(window) = app.get_webview_window("main") {
        match target.parse::<tauri::Url>() {
            Ok(parsed) => window.navigate(parsed).map_err(|e| e.to_string())?,
            Err(err) => return Err(format!("bad billing url: {err}")),
        }
    }
    Ok(())
}

/// Store the latest Clerk session token. Called repeatedly by the authenticated
/// editor window (which can mint fresh tokens via Clerk's `getToken()`). The
/// selector reads it via `get_session_token` to authenticate its rewrite calls.
#[tauri::command]
fn set_session_token(
    state: State<'_, SelectorState>,
    token: Option<String>,
) -> Result<(), String> {
    let mut slot = state.session_token.lock().map_err(|e| e.to_string())?;
    *slot = token.filter(|t| !t.is_empty());
    Ok(())
}

/// Return the latest stored Clerk session token (or null if none/expired). The
/// selector attaches it as a `Bearer` header so the rewrite API can identify the
/// user and count the rewrite against their daily limit.
#[tauri::command]
fn get_session_token(state: State<'_, SelectorState>) -> Result<Option<String>, String> {
    let slot = state.session_token.lock().map_err(|e| e.to_string())?;
    Ok(slot.clone())
}

fn ensure_selector_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("selector") {
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        let _ = window.set_visible_on_all_workspaces(true);
        let _ = window.set_always_on_top(true);
        return Ok(window);
    }

    // The selector is a NATIVE OVERLAY and must ALWAYS load from the bundled
    // local frontend (`/selector`) — never the remote site. The main editor
    // window stays remote (needs first-party Clerk cookies); the selector has
    // no such need and MUST track local builds.
    let builder = WebviewWindowBuilder::new(app, "selector", WebviewUrl::App("/selector".into()))
        .title("huu selector")
        .inner_size(SELECTOR_DOT_SIZE, SELECTOR_DOT_SIZE)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible(false)
        .skip_taskbar(true);

    // macOS: keep all workspaces visible and accept first mouse so the first
    // click on the dot lands without needing a prior focus click.
    #[cfg(target_os = "macos")]
    let builder = builder
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true);

    builder.build().map_err(|e| e.to_string())
}

/// Does this probe hold a selection worth offering to rephrase?
fn is_probe_rephrashable(probe: &SelectionProbe) -> bool {
    probe
        .selection
        .as_ref()
        .map(|s| {
            let t = s.text.trim();
            !t.is_empty() && is_rephrashable(t)
        })
        .unwrap_or(false)
}

/// Hide the floating dot (with the CSS fade) and forget its frame.
#[cfg(target_os = "macos")]
fn hide_selector_dot(app: &tauri::AppHandle, state: &SelectorState) {
    if let Ok(mut frame) = state.dot_frame.lock() {
        *frame = None;
    }
    if let Some(window) = app.get_webview_window("selector") {
        if window.is_visible().unwrap_or(false) {
            fade_and_hide_selector(&window);
        }
    }
}

/// Is the point (global display points) on top of the currently-shown dot? Used
/// to keep a click on the dot from being treated as a "click elsewhere" dismiss.
#[cfg(target_os = "macos")]
fn point_in_dot_frame(state: &SelectorState, x: f64, y: f64) -> bool {
    if let Ok(frame) = state.dot_frame.lock() {
        if let Some((fx, fy, fw, fh)) = *frame {
            let pad = 6.0;
            return x >= fx - pad && x <= fx + fw + pad && y >= fy - pad && y <= fy + fh + pad;
        }
    }
    false
}

// ─────────────────────────────────────────────────────────────────────────────
// macOS: event-driven selector (the anti-chase design)
//
// The old approach POLLED the accessibility tree 5×/second and showed the dot
// "while a selection exists, hide when it's gone." Web/Electron apps report the
// selection flickering on and off between polls, so the dot hid then re-appeared
// at the new cursor spot — that hide/reshow loop *was* the chasing.
//
// Instead we react to the discrete mouse gesture that ENDS a selection: a left
// mouse-up. At that one instant we probe the selection ONCE, place the dot, and
// never re-read or move it again until the next gesture. Chasing is therefore
// structurally impossible — nothing re-positions the dot after it's shown.
//
// A system event tap (listen-only, needs the Accessibility permission we already
// hold) delivers the up/down events on its own CFRunLoop thread; the heavy work
// (sleep + probe + window ops) runs on a separate worker so the tap callback
// stays instant (a slow callback gets the tap disabled by the OS).
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(target_os = "macos")]
fn start_selection_watcher(app: tauri::AppHandle) {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{mpsc, Arc};

    enum MouseSignal {
        Down(f64, f64),
        // up_x/up_y plus the gesture sequence number at release time.
        Up(f64, f64, u64),
    }

    let (tx, rx) = mpsc::channel::<MouseSignal>();
    // Bumped on EVERY mouse event. A pending mouse-up that finds a newer value
    // when its 1s timer expires has been superseded (the user clicked or started
    // a new selection in the meantime) and bails out — this is what stops a stale
    // dot from appearing and keeps rapid gestures from stacking up.
    let seq = Arc::new(AtomicU64::new(0));

    // Worker thread: owns all logic, sleeps, and Tauri window calls.
    {
        let app = app.clone();
        let seq = seq.clone();
        std::thread::spawn(move || {
            let state = app.state::<SelectorState>();
            if let Ok(mut running) = state.watcher_running.lock() {
                *running = true;
            }
            debug_log("mouse-driven selector worker started");

            // Where the most recent left-press landed — the drag ANCHOR. The
            // selection's text body grows from here toward the release point, so
            // the anchor is what tells us the gesture's DIRECTION (and therefore
            // which side the dot belongs on) in every app, even ones that report
            // no usable selection geometry.
            let mut last_down = (0.0_f64, 0.0_f64);

            while let Ok(sig) = rx.recv() {
                let popup_open = state.popup_open.lock().map(|o| *o).unwrap_or(false);
                match sig {
                    MouseSignal::Down(x, y) => {
                        last_down = (x, y);
                        // While the expanded panel is open, hands off completely.
                        if popup_open {
                            continue;
                        }
                        // A click on the dot itself opens the panel — don't dismiss.
                        if point_in_dot_frame(&state, x, y) {
                            continue;
                        }
                        // Any other click dismisses the dot immediately (snappy).
                        hide_selector_dot(&app, &state);
                    }
                    MouseSignal::Up(up_x, up_y, up_seq) => {
                        if popup_open {
                            continue;
                        }
                        // DELIBERATE 1s pause: give the selection time to settle and
                        // don't pop up the instant someone idly highlights something
                        // they may not want to rephrase. If anything else happened
                        // during that second, this gesture was superseded — bail.
                        std::thread::sleep(Duration::from_millis(1000));
                        if seq.load(Ordering::Relaxed) != up_seq {
                            continue;
                        }

                        let mut probe = platform_current_selection_probe();
                        if probe.status != "huu-self-focused" && !is_probe_rephrashable(&probe) {
                            // One retry for apps slow to publish the selection.
                            std::thread::sleep(Duration::from_millis(150));
                            if seq.load(Ordering::Relaxed) != up_seq {
                                continue;
                            }
                            probe = platform_current_selection_probe();
                        }

                        if let Ok(mut last_status) = state.last_status.lock() {
                            *last_status = probe.status.clone();
                        }

                        // Clicking our own dot/panel: leave the window untouched.
                        if probe.status == "huu-self-focused" {
                            continue;
                        }
                        // The panel may have opened during our wait — re-check.
                        if state.popup_open.lock().map(|o| *o).unwrap_or(false) {
                            continue;
                        }

                        if !is_probe_rephrashable(&probe) {
                            // No selection — a plain click / deselect. Ensure hidden.
                            hide_selector_dot(&app, &state);
                            continue;
                        }

                        let mut sel = probe.selection.expect("rephrashable implies Some");
                        let gap = 8.0;
                        let half = SELECTOR_DOT_SIZE / 2.0;

                        // ── THE ONE RULE ───────────────────────────────────────────
                        // The dot appears at the END of the highlight — where the drag
                        // was RELEASED — nudged just outside the text. The gesture's
                        // DIRECTION (press → release), read straight off the mouse,
                        // decides which side "outside" is: the selected text body grows
                        // back toward the press anchor, so the dot sits on the side of
                        // the release AWAY from the anchor. We use the dominant drag
                        // axis, so it is correct for every direction — L→R, R→L, up,
                        // down, and all four diagonals — and needs zero app cooperation,
                        // making it identical in every app.
                        let dx = up_x - last_down.0;
                        let dy = up_y - last_down.1;
                        let ends_at_end = if dx.abs() >= dy.abs() {
                            dx >= 0.0 // horizontal drag: rightward ends at the right end
                        } else {
                            dy >= 0.0 // vertical drag: downward ends at the bottom end
                        };
                        debug_log(&format!(
                            "  gesture down=({:.0},{:.0}) up=({:.0},{:.0}) dx={:.0} dy={:.0} ends_at_end={}",
                            last_down.0, last_down.1, up_x, up_y, dx, dy, ends_at_end
                        ));

                        let (center_x, center_y) =
                            if let Some((cx, cy)) =
                                platform_selection_endpoint(ends_at_end)
                            {
                                // BEST: the exact text endpoint on its OWN line (per
                                // character / per line — never a bounding-box middle).
                                // The endpoint matching the gesture was already chosen;
                                // we only nudge the dot just outside that edge.
                                if ends_at_end {
                                    (cx + gap + half, cy)
                                } else {
                                    (cx - gap - half, cy)
                                }
                            } else {
                                // FALLBACK: the app exposes no usable text geometry
                                // (many report a 1×1 selection rect). The RELEASE POINT
                                // is the highlight's end; offset it to the gesture's
                                // outer side. Pure gesture — consistent everywhere.
                                if ends_at_end {
                                    (up_x + gap + half, up_y)
                                } else {
                                    (up_x - gap - half, up_y)
                                }
                            };
                        // Hand the positioner the exact desired DOT CENTER as a point
                        // anchor (zero size).
                        sel.x = center_x;
                        sel.y = center_y;
                        sel.width = 0.0;
                        sel.height = 0.0;
                        if let Err(err) = show_selector_for_selection(&app, &state, sel) {
                            debug_log(&format!("show selector failed: {err}"));
                        }
                    }
                }
            }
        });
    }

    // Event-tap thread: a dedicated CFRunLoop forwarding left mouse up/down.
    std::thread::spawn(move || {
        use core_foundation::runloop::{kCFRunLoopCommonModes, CFRunLoop};
        use core_graphics::event::{
            CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
        };

        let tap = CGEventTap::new(
            CGEventTapLocation::HID,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            vec![CGEventType::LeftMouseDown, CGEventType::LeftMouseUp],
            move |_proxy, etype, event| {
                let p = event.location();
                let v = seq.fetch_add(1, Ordering::Relaxed) + 1;
                let _ = match etype {
                    CGEventType::LeftMouseDown => tx.send(MouseSignal::Down(p.x, p.y)),
                    CGEventType::LeftMouseUp => tx.send(MouseSignal::Up(p.x, p.y, v)),
                    _ => Ok(()),
                };
                None
            },
        );

        match tap {
            Ok(tap) => unsafe {
                match tap.mach_port.create_runloop_source(0) {
                    Ok(source) => {
                        CFRunLoop::get_current().add_source(&source, kCFRunLoopCommonModes);
                        tap.enable();
                        debug_log("mouse event tap installed");
                        CFRunLoop::run_current();
                    }
                    Err(_) => debug_log("event tap: failed to create runloop source"),
                }
            },
            Err(_) => debug_log("event tap: creation failed (accessibility not granted?)"),
        }
    });
}

// Non-macOS (Windows, …): keep the polling watcher. Windows UI Automation gives
// real, stable selection bounds, so the chase bug never manifested there and the
// simpler poll loop is fine.
#[cfg(not(target_os = "macos"))]
fn start_selection_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_probe_status = String::new();
        let mut last_text = String::new();
        const STABLE_POLLS_REQUIRED: u32 = 3;
        let mut stable_count: u32 = 0;
        let mut shown = false;
        const MISSES_BEFORE_HIDE: u32 = 4;
        let mut miss_count: u32 = 0;

        let state = app.state::<SelectorState>();
        if let Ok(mut watcher_running) = state.watcher_running.lock() {
            *watcher_running = true;
        }

        debug_log("selection watcher started");

        loop {
            std::thread::sleep(Duration::from_millis(200));

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

            if probe.status == "huu-self-focused" {
                continue;
            }

            let rephrashable = is_probe_rephrashable(&probe);

            if !rephrashable {
                if shown || stable_count > 0 {
                    miss_count += 1;
                    if miss_count >= MISSES_BEFORE_HIDE {
                        last_text.clear();
                        stable_count = 0;
                        shown = false;
                        miss_count = 0;
                        if let Some(window) = app.get_webview_window("selector") {
                            fade_and_hide_selector(&window);
                        }
                    }
                }
                continue;
            }

            miss_count = 0;

            if shown {
                continue;
            }

            let selection = probe.selection.expect("rephrashable implies Some");
            let text = selection.text.trim().to_string();

            if text != last_text {
                last_text = text;
                stable_count = 1;
            } else {
                stable_count += 1;
                if stable_count >= STABLE_POLLS_REQUIRED {
                    if let Err(err) = show_selector_for_selection(&app, &state, selection) {
                        debug_log(&format!("show selector failed: {err}"));
                    }
                    shown = true;
                }
            }
        }
    });
}

fn debug_log(message: &str) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    let log_path = std::env::temp_dir().join("huu-selector.log");
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
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

#[cfg(target_os = "windows")]
fn activate_source_process(pid: i32) -> Result<(), String> {
    windows_accessibility::bring_process_to_front(pid as u32);
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn activate_source_process(_pid: i32) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn send_shortcut(key: &str) -> Result<(), String> {
    // Send a real ⌘-chord through System Events using the physical KEY CODE.
    //
    // Both enigo paths we tried before failed: `enigo.text("v")` posts a Unicode
    // INSERTION (ignores modifiers entirely), and `enigo.key(Key::Unicode('v'))`
    // with Meta held still didn't set the Command flag on the key event — so the
    // app received a plain "v" keystroke, which the field auto-capitalized to
    // "V". That was the "Accept replaces my text with V" bug.
    //
    // `key code N using command down` sets the modifier on the event at the OS
    // level, so the frontmost app interprets it as ⌘V (paste) / ⌘C (copy).
    // macOS ANSI key codes: V = 9, C = 8.
    let key_code = match key {
        "v" => 9,
        "c" => 8,
        other => return Err(format!("unsupported shortcut key: {other}")),
    };

    let script =
        format!("tell application \"System Events\" to key code {key_code} using command down");
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("paste shortcut osascript exited with {status}"));
    }
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

#[cfg(target_os = "windows")]
fn platform_current_selection() -> Result<Option<DesktopSelection>, String> {
    Ok(windows_accessibility::current_selection_probe().selection)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_current_selection() -> Result<Option<DesktopSelection>, String> {
    Ok(None)
}

#[cfg(target_os = "macos")]
fn platform_current_selection_probe() -> SelectionProbe {
    macos_accessibility::current_selection_probe()
}

#[cfg(target_os = "windows")]
fn platform_current_selection_probe() -> SelectionProbe {
    windows_accessibility::current_selection_probe()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_current_selection_probe() -> SelectionProbe {
    SelectionProbe {
        selection: None,
        status: "selector unavailable on this platform".to_string(),
    }
}

/// The exact text-edge coordinate at the chosen end of the selection. `ends_at_end`
/// (decided by the caller from the mouse drag direction) selects WHICH end: true →
/// the right/bottom edge of the last glyph; false → the left/top edge of the first
/// glyph. Returns the edge on its own visual line (per-character, never a bounding
/// box middle). None when the focused element exposes no character range or markers,
/// so the caller falls back to the mouse-release point.
#[cfg(target_os = "macos")]
fn platform_selection_endpoint(ends_at_end: bool) -> Option<(f64, f64)> {
    macos_accessibility::selection_endpoint(ends_at_end)
}

#[cfg(not(target_os = "macos"))]
fn platform_selection_endpoint(_ends_at_end: bool) -> Option<(f64, f64)> {
    None
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
        fn AXValueCreate(value_type: i32, value_ptr: *const c_void) -> AXValueRef;
        // Text-marker primitives (HIServices, exported but header-private — the
        // same ones VoiceOver uses). Web content (Chromium/WebKit) exposes its
        // selection ONLY through markers, never AXSelectedTextRange, so these are
        // how we reach per-line endpoint geometry in browsers/Electron apps.
        fn AXTextMarkerRangeCopyStartMarker(range: CFTypeRef) -> CFTypeRef;
        fn AXTextMarkerRangeCopyEndMarker(range: CFTypeRef) -> CFTypeRef;
        fn AXTextMarkerRangeCreate(
            allocator: CFTypeRef,
            start_marker: CFTypeRef,
            end_marker: CFTypeRef,
        ) -> CFTypeRef;
    }

    // AXValueType for a CFRange ({location, length}); 3 is the CGRect type used
    // elsewhere. CFIndex is a pointer-sized signed int.
    const AX_VALUE_CF_RANGE: i32 = 4;

    #[repr(C)]
    struct CFRangeRaw {
        location: isize,
        length: isize,
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

    /// The selection's {location, length} as character indices, if this is a
    /// native text element that exposes AXSelectedTextRange.
    unsafe fn selected_char_range(element: AXUIElementRef) -> Option<(isize, isize)> {
        let attr = CFString::new("AXSelectedTextRange");
        let mut range_ref: CFTypeRef = ptr::null();
        let err =
            AXUIElementCopyAttributeValue(element, attr.as_concrete_TypeRef(), &mut range_ref);
        if err != AX_ERROR_SUCCESS || range_ref.is_null() {
            return None;
        }
        let mut range = CFRangeRaw { location: 0, length: 0 };
        let ok = AXValueGetValue(
            range_ref as AXValueRef,
            AX_VALUE_CF_RANGE,
            &mut range as *mut CFRangeRaw as *mut c_void,
        );
        CFRelease(range_ref);
        if ok == 0 {
            return None;
        }
        Some((range.location, range.length))
    }

    /// Bounding rect of the `length`-character range starting at `index`. We use a
    /// 1-char range (not a zero-length caret): a zero-length `AXBoundsForRange`
    /// reports a Y that can be a full line too high in some text views, whereas a
    /// real character's box reliably lands on its own visual line.
    unsafe fn range_rect(element: AXUIElementRef, index: isize, length: isize) -> Option<CGRect> {
        if index < 0 || length <= 0 {
            return None;
        }
        let range = CFRangeRaw {
            location: index,
            length,
        };
        let range_value = AXValueCreate(
            AX_VALUE_CF_RANGE,
            &range as *const CFRangeRaw as *const c_void,
        );
        if range_value.is_null() {
            return None;
        }

        let attr = CFString::new("AXBoundsForRange");
        let mut bounds_ref: CFTypeRef = ptr::null();
        let err = AXUIElementCopyParameterizedAttributeValue(
            element,
            attr.as_concrete_TypeRef(),
            range_value as CFTypeRef,
            &mut bounds_ref,
        );
        CFRelease(range_value as CFTypeRef);
        if err != AX_ERROR_SUCCESS || bounds_ref.is_null() {
            return None;
        }

        let rect = cg_rect_from_ax_value(bounds_ref);
        CFRelease(bounds_ref);
        let r = rect?;
        // Reject anything that isn't a plausible single text line.
        if !r.origin.x.is_finite()
            || !r.origin.y.is_finite()
            || r.size.height <= 4.0
            || r.size.height >= 80.0
        {
            return None;
        }
        Some(r)
    }

    /// Parameterized-attribute call that takes a single text marker and returns
    /// another marker (e.g. AXNextTextMarkerForTextMarker /
    /// AXPreviousTextMarkerForTextMarker). Caller owns the result.
    unsafe fn param_marker(
        element: AXUIElementRef,
        attr_name: &str,
        marker: CFTypeRef,
    ) -> Option<CFTypeRef> {
        let attr = CFString::new(attr_name);
        let mut out: CFTypeRef = ptr::null();
        let err = AXUIElementCopyParameterizedAttributeValue(
            element,
            attr.as_concrete_TypeRef(),
            marker,
            &mut out,
        );
        if err != AX_ERROR_SUCCESS || out.is_null() {
            return None;
        }
        Some(out)
    }

    /// Bounds of a text-marker range, validated to a plausible single text line.
    unsafe fn bounds_for_marker_range(
        element: AXUIElementRef,
        range: CFTypeRef,
    ) -> Option<CGRect> {
        let attr = CFString::new("AXBoundsForTextMarkerRange");
        let mut out: CFTypeRef = ptr::null();
        let err = AXUIElementCopyParameterizedAttributeValue(
            element,
            attr.as_concrete_TypeRef(),
            range,
            &mut out,
        );
        if err != AX_ERROR_SUCCESS || out.is_null() {
            return None;
        }
        let rect = cg_rect_from_ax_value(out);
        CFRelease(out);
        let r = rect?;
        if !r.origin.x.is_finite()
            || !r.origin.y.is_finite()
            || r.size.height <= 4.0
            || r.size.height >= 80.0
        {
            return None;
        }
        Some(r)
    }

    /// Web-content endpoint detection via text markers — the marker-world twin of
    /// the native per-character path. Given an element that exposes a selected
    /// text-marker range, builds a ONE-CHARACTER marker range at each end of the
    /// selection (start..next(start) and prev(end)..end) and measures each box.
    /// Because each box is a single glyph, it sits on its OWN visual line — so a
    /// diagonal/multi-line selection in Chrome/Twitter/Electron resolves to the
    /// real first/last character, exactly like TextEdit, instead of the union
    /// box's middle. Returns (first_char_box, last_char_box).
    unsafe fn marker_endpoint_boxes(element: AXUIElementRef) -> Option<(CGRect, CGRect)> {
        let sel_range = copy_attribute(element, "AXSelectedTextMarkerRange")?;
        let start_marker = AXTextMarkerRangeCopyStartMarker(sel_range);
        let end_marker = AXTextMarkerRangeCopyEndMarker(sel_range);
        CFRelease(sel_range);
        if start_marker.is_null() || end_marker.is_null() {
            if !start_marker.is_null() {
                CFRelease(start_marker);
            }
            if !end_marker.is_null() {
                CFRelease(end_marker);
            }
            return None;
        }

        // First glyph: [start, next(start)].
        let first = param_marker(element, "AXNextTextMarkerForTextMarker", start_marker)
            .and_then(|next| {
                let r = AXTextMarkerRangeCreate(ptr::null(), start_marker, next);
                CFRelease(next);
                if r.is_null() {
                    return None;
                }
                let b = bounds_for_marker_range(element, r);
                CFRelease(r);
                b
            });
        // Last glyph: [prev(end), end].
        let last = param_marker(element, "AXPreviousTextMarkerForTextMarker", end_marker)
            .and_then(|prev| {
                let r = AXTextMarkerRangeCreate(ptr::null(), prev, end_marker);
                CFRelease(prev);
                if r.is_null() {
                    return None;
                }
                let b = bounds_for_marker_range(element, r);
                CFRelease(r);
                b
            });

        CFRelease(start_marker);
        CFRelease(end_marker);
        match (first, last) {
            (Some(f), Some(l)) => Some((f, l)),
            _ => None,
        }
    }

    /// The exact text-edge coordinate at the chosen end of the selection. The
    /// caller decides WHICH end from the mouse drag direction and passes it as
    /// `ends_at_end`: true → the RIGHT edge of the last glyph (dot goes right);
    /// false → the LEFT edge of the first glyph (dot goes left). Measures the
    /// first and last selected glyphs individually so the edge is always on its
    /// own visual line — correct for multi-line / diagonal selections, never the
    /// bounding-box middle. None when the focused element exposes no character
    /// range or markers.
    pub fn selection_endpoint(ends_at_end: bool) -> Option<(f64, f64)> {
        if !is_trusted(false) {
            return None;
        }
        unsafe {
            let system = AXUIElementCreateSystemWide();
            if system.is_null() {
                return None;
            }
            AXUIElementSetMessagingTimeout(system, 0.25);
            let focused = copy_focused_element(system);
            CFRelease(system as CFTypeRef);
            let focused = focused?;

            let mut chain: Vec<AXUIElementRef> = vec![focused as AXUIElementRef];
            let mut owned: Vec<CFTypeRef> = Vec::new();
            let mut current = focused as AXUIElementRef;
            for _ in 0..8 {
                let Some(parent_ref) = copy_attribute(current, "AXParent") else {
                    break;
                };
                owned.push(parent_ref);
                current = parent_ref as AXUIElementRef;
                chain.push(current);
            }

            let mut result = None;
            for el in chain.iter() {
                let Some((loc, len)) = selected_char_range(*el) else {
                    continue;
                };
                if len <= 0 {
                    continue;
                }
                // First selected char (its LEFT edge = where the highlight starts)
                // and last selected char (its RIGHT edge = where the highlight ends),
                // each on its own visual line. We SCAN past degenerate boxes —
                // newlines and empty glyphs report a zero-width rect (often parked at
                // the next line's start), which would otherwise throw the endpoint
                // onto the wrong line or fail entirely. Skipping them lands us on the
                // last/first VISIBLE character, which is what "where the text ends"
                // actually means.
                let mut first: Option<CGRect> = None;
                let mut k = 0;
                while k < 8 {
                    let idx = loc + k;
                    if idx >= loc + len {
                        break;
                    }
                    if let Some(r) = range_rect(*el, idx, 1) {
                        if r.size.width >= 1.0 {
                            first = Some(r);
                            break;
                        }
                    }
                    k += 1;
                }
                let mut last: Option<CGRect> = None;
                let mut k = 0;
                while k < 8 {
                    let idx = loc + len - 1 - k;
                    if idx < loc {
                        break;
                    }
                    if let Some(r) = range_rect(*el, idx, 1) {
                        if r.size.width >= 1.0 {
                            last = Some(r);
                            break;
                        }
                    }
                    k += 1;
                }
                if let (Some(f), Some(l)) = (first, last) {
                    // `first`/`last` come from the character range, which is already
                    // in document order, so `first` is the left/top edge and `last`
                    // the right/bottom edge. The gesture decided which one we want.
                    let start_pt = (f.origin.x, f.origin.y + f.size.height / 2.0);
                    let end_pt = (
                        l.origin.x + l.size.width,
                        l.origin.y + l.size.height / 2.0,
                    );
                    let c = if ends_at_end { end_pt } else { start_pt };
                    super::debug_log(&format!(
                        "  caret_endpoint start=({:.0},{:.0}) end=({:.0},{:.0}) ends_at_end={} center=({:.0},{:.0})",
                        start_pt.0, start_pt.1, end_pt.0, end_pt.1, ends_at_end, c.0, c.1
                    ));
                    result = Some((c.0, c.1));
                    break;
                }
            }

            // WEB-CONTENT PASS: native AXSelectedTextRange path found nothing
            // (Chrome, Twitter, Claude web, Electron — they don't expose it).
            // Resolve the per-line endpoint through text markers instead.
            if result.is_none() {
                for el in chain.iter() {
                    let Some((b0, b1)) = marker_endpoint_boxes(*el) else {
                        continue;
                    };
                    // Web apps hand back the start/end markers in ANCHOR→FOCUS
                    // order (where the drag began → where it ended), NOT document
                    // order. So for a right-to-left or bottom-to-top selection the
                    // "start" box is actually the visual END. Re-derive true
                    // document order from geometry: the earlier endpoint is the one
                    // on the higher line (smaller y), or — on the same line — the
                    // one further left (smaller x). Without this, an R→L selection
                    // anchors the dot to the wrong edge and lands ON the word.
                    let line_eps = 6.0;
                    let (doc_start, doc_end) = if (b0.origin.y - b1.origin.y).abs() > line_eps {
                        if b0.origin.y < b1.origin.y { (b0, b1) } else { (b1, b0) }
                    } else if b0.origin.x <= b1.origin.x {
                        (b0, b1)
                    } else {
                        (b1, b0)
                    };
                    // start_pt = LEFT edge of the first selected glyph (dot goes to
                    // its left); end_pt = RIGHT edge of the last (dot goes to its
                    // right). The gesture decided which one we want.
                    let start_pt = (
                        doc_start.origin.x,
                        doc_start.origin.y + doc_start.size.height / 2.0,
                    );
                    let end_pt = (
                        doc_end.origin.x + doc_end.size.width,
                        doc_end.origin.y + doc_end.size.height / 2.0,
                    );
                    let c = if ends_at_end { end_pt } else { start_pt };
                    super::debug_log(&format!(
                        "  marker_endpoint start=({:.0},{:.0}) end=({:.0},{:.0}) ends_at_end={} center=({:.0},{:.0})",
                        start_pt.0, start_pt.1, end_pt.0, end_pt.1, ends_at_end, c.0, c.1
                    ));
                    result = Some((c.0, c.1));
                    break;
                }
            }

            owned.iter().for_each(|r| CFRelease(*r));
            CFRelease(focused);
            result
        }
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

    let ch = match key {
        "v" => 'v',
        "c" => 'c',
        other => return Err(format!("unsupported shortcut key: {other}")),
    };
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.key(Key::Control, Direction::Press).map_err(|e| e.to_string())?;
    enigo.key(Key::Unicode(ch), Direction::Click).map_err(|e| e.to_string())?;
    enigo.key(Key::Control, Direction::Release).map_err(|e| e.to_string())?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows text-selection via UI Automation
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(target_os = "windows")]
mod windows_accessibility {
    use windows::{
        core::Interface,
        Win32::{
            Foundation::POINT,
            System::Com::{
                CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER,
                COINIT_APARTMENTTHREADED,
            },
            System::Ole::{
                SafeArrayAccessData, SafeArrayGetLBound, SafeArrayGetUBound,
                SafeArrayUnaccessData,
            },
            UI::{
                Accessibility::{
                    CUIAutomation, IUIAutomation, IUIAutomationTextPattern,
                    UIA_TextPatternId,
                },
                WindowsAndMessaging::{
                    EnumWindows, GetCursorPos, GetWindowThreadProcessId, IsWindowVisible,
                    SetForegroundWindow,
                },
            },
        },
    };
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};

    use super::{DesktopSelection, SelectionProbe};

    // COM must be initialised once per thread. We call this at the start of every
    // probe — CoInitializeEx returns S_FALSE (not an error) if already done.
    fn ensure_com() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
    }

    pub fn current_selection_probe() -> SelectionProbe {
        ensure_com();
        match try_get_selection() {
            Ok(Some(sel)) => SelectionProbe {
                status: format!(
                    "selection found len={} can_replace={}",
                    sel.text.len(),
                    sel.can_replace
                ),
                selection: Some(sel),
            },
            Ok(None) => SelectionProbe {
                selection: None,
                status: "no text selected".to_string(),
            },
            Err(e) => SelectionProbe {
                selection: None,
                status: format!("uia: {e}"),
            },
        }
    }

    fn try_get_selection() -> windows::core::Result<Option<DesktopSelection>> {
        unsafe {
            // Get the UI Automation instance (in-process COM server).
            let automation: IUIAutomation = CoCreateInstance(
                &CUIAutomation,
                None,
                CLSCTX_INPROC_SERVER,
            )?;

            // Get the element that currently has keyboard focus.
            let element = automation.GetFocusedElement()?;

            // Ignore focus on our own process (selector window is focused).
            let pid = element.CurrentProcessId()? as u32;
            if pid == std::process::id() {
                return Ok(None);
            }

            // Check if the focused element supports the Text pattern.
            let pattern_unk = match element.GetCurrentPattern(UIA_TextPatternId) {
                Ok(p) => p,
                Err(_) => return Ok(None),
            };
            let text_pattern: IUIAutomationTextPattern = pattern_unk.cast()?;

            // Get the current text selection (array of ranges).
            let selection_array = text_pattern.GetSelection()?;
            if selection_array.Length()? == 0 {
                return Ok(None);
            }

            let range = selection_array.GetElement(0)?;
            let text = range.GetText(-1)?.to_string();
            if text.trim().is_empty() {
                return Ok(None);
            }

            // Bounding rect of the first selected range (for button placement).
            let (x, y, width, height) = get_range_bounds(&range);

            Ok(Some(DesktopSelection {
                text,
                x,
                y,
                width,
                height,
                source_pid: Some(pid as i32),
                can_replace: true,
            }))
        }
    }

    unsafe fn get_range_bounds(
        range: &windows::Win32::UI::Accessibility::IUIAutomationTextRange,
    ) -> (f64, f64, f64, f64) {
        // GetBoundingRectangles returns a SAFEARRAY of DOUBLE:
        // [left, top, width, height, left2, top2, ...] (one rect per line of text).
        // We use the first rect; fall back to cursor position on any error.
        let sa = match range.GetBoundingRectangles() {
            Ok(p) if !p.is_null() => p,
            _ => return cursor_pos_rect(),
        };

        let lb = match SafeArrayGetLBound(sa, 1) {
            Ok(v) => v,
            Err(_) => return cursor_pos_rect(),
        };
        let ub = match SafeArrayGetUBound(sa, 1) {
            Ok(v) => v,
            Err(_) => return cursor_pos_rect(),
        };
        if ub - lb + 1 < 4 {
            return cursor_pos_rect();
        }

        let mut raw: *mut std::ffi::c_void = std::ptr::null_mut();
        if SafeArrayAccessData(sa, &mut raw).is_err() || raw.is_null() {
            return cursor_pos_rect();
        }

        let count = (ub - lb + 1) as usize;
        let slice = std::slice::from_raw_parts(raw as *const f64, count);
        let result = (slice[0], slice[1], slice[2], slice[3]);
        let _ = SafeArrayUnaccessData(sa);
        result
    }

    fn cursor_pos_rect() -> (f64, f64, f64, f64) {
        unsafe {
            let mut pt = POINT::default();
            let _ = GetCursorPos(&mut pt);
            (pt.x as f64, pt.y as f64, 1.0, 1.0)
        }
    }

    // Find the foreground window owned by `target_pid` and call SetForegroundWindow
    // on it so the source app regains focus before we send Ctrl+V.
    pub fn bring_process_to_front(target_pid: u32) {
        struct SearchData {
            target_pid: u32,
            found: HWND,
        }

        unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let data = &mut *(lparam.0 as *mut SearchData);
            let mut win_pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut win_pid));
            if win_pid == data.target_pid && IsWindowVisible(hwnd).as_bool() {
                data.found = hwnd;
                return BOOL(0); // stop enumeration
            }
            BOOL(1)
        }

        let mut data = SearchData {
            target_pid,
            found: HWND::default(),
        };
        unsafe {
            let _ = EnumWindows(
                Some(enum_callback),
                LPARAM(&mut data as *mut SearchData as isize),
            );
            if data.found != HWND::default() {
                let _ = SetForegroundWindow(data.found);
            }
        }
    }
}
