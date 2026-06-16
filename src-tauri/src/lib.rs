use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, RunEvent, State, WebviewUrl,
    WebviewWindowBuilder, WindowEvent,
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
    // Bumped every time the editor pushes a token via `set_session_token`. The
    // on-demand `refresh_session_token` command watches this to detect when the
    // editor has responded to a mint request with a fresh token.
    token_generation: std::sync::atomic::AtomicU64,
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
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            get_session_token,
            refresh_session_token
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

            // Rust-driven token heartbeat. The editor mints ~60s Clerk tokens for
            // the selector, but its OWN setInterval throttles to >60s when the
            // window is hidden — so the token expired right when you used the
            // selector elsewhere (the "Open huumanity and sign in" bug). Rust
            // timers are never throttled, so we drive the mint from here: every
            // 25s we ask the editor to refresh the token. (The editor's listener
            // no-ops when signed out, so this is harmless then.)
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(Duration::from_secs(25));
                    let _ = handle.emit_to("main", "huu-mint-token", ());
                });
            }

            // Background auto-updater: check for a new release ~5 seconds after
            // launch, download and install silently, restart on next open.
            {
                use tauri_plugin_updater::UpdaterExt;
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    if let Ok(updater) = handle.updater() {
                        if let Ok(Some(update)) = updater.check().await {
                            let _ = update
                                .download_and_install(|_chunk, _total| {}, || {})
                                .await;
                        }
                    }
                });
            }

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
                // macOS fires `Reopen` whenever huu is activated with no "normal"
                // window on screen. That happens BOTH on a genuine dock-icon click
                // (where we DO want to surface the editor) and as a pure side
                // effect of interacting with the selector overlay — clicking the
                // dot, the cross, Copy, or Accept (where we must NOT).
                //
                // Distinguish them deterministically: if the selector overlay is
                // currently on screen, the Reopen is by definition an artifact of
                // touching it — a real "open the app" click only happens when no
                // overlay is up. A pure time window was unreliable: if the user
                // lingered before clicking the dot, the first click fired Reopen
                // and popped the editor before the JS could re-mark activity.
                //
                // The time window stays as a second guard, but only to cover the
                // brief moment AFTER the overlay hides (Copy/Accept/close), when
                // the OS fires Reopen a beat later and the window is already gone.
                let state = app.state::<SelectorState>();
                let selector_visible = app
                    .get_webview_window("selector")
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(false);
                // The expanded tone/result panel taking focus is a guaranteed source
                // of a spurious Reopen — never surface the editor while it's open.
                let panel_open = state.popup_open.lock().map(|o| *o).unwrap_or(false);
                if panel_open {
                    debug_log("ignoring Reopen while selector panel is open");
                } else if selector_visible {
                    debug_log("ignoring Reopen while selector overlay is visible");
                } else if selector_recently_active(&state) {
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
    // Hiding the selector here makes macOS fire a spurious `Reopen` (no visible
    // huu windows left). Mark activity FIRST so the Reopen handler suppresses it
    // — otherwise accepting a rewrite would pop the editor window open. (Same
    // guard the normal `hide_selector_window` path already uses.)
    mark_selector_activity(&state);
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
/// existence. We add a CSS class the frontend animates (the 220ms `huuFadeOut`,
/// mirroring the show animation), wait for it to finish, then hide. The next show
/// removes the class and plays the pop-in (see `show_selector_for_selection`).
fn fade_and_hide_selector(window: &tauri::WebviewWindow) {
    let _ = window.eval("document.documentElement.classList.add('huu-hiding')");
    // Match the 220ms fade-out (+ a hair) so the animation completes before hide.
    std::thread::sleep(Duration::from_millis(235));
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
    // FIXED position: a Grammarly-style tab flush to the RIGHT edge of the screen,
    // vertically centered. This is independent of the selection — the dot never
    // moves, never chases the cursor, and never repositions on scroll. The only
    // thing the selection controls is WHETHER the dot is shown, not where.
    let (x, y, w, h) = fixed_dot_window_rect(app);
    let _ = window.eval(
        "document.documentElement.classList.remove('huu-hiding'); \
         window.dispatchEvent(new CustomEvent('huu-selector-collapse'))",
    );
    debug_log(&format!(
        "show selector text_len={} fixed-tab pos=({}, {})",
        selection.text.len(),
        x.round(),
        y.round()
    ));

    window
        .set_size(LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    // Showing the dot can itself activate huu and fire a `Reopen` a beat later;
    // mark activity now so that transient event is suppressed even before the
    // window's `is_visible()` flips true.
    mark_selector_activity(state);

    // Remember where the dot is so the mouse tap can tell a click ON it apart
    // from a click elsewhere.
    if let Ok(mut frame) = state.dot_frame.lock() {
        *frame = Some((x, y, w, h));
    }
    Ok(())
}

/// Window dimensions (logical points) for the collapsed dot — a vertical TAB that
/// protrudes from the right screen edge. The visible pill is right-aligned inside
/// this window; the extra width on the left and padding top/bottom is transparent
/// room for the drop shadow. Kept in sync with the frontend pill (`h-12 w-8`).
const SELECTOR_TAB_W: f64 = 48.0;
const SELECTOR_TAB_H: f64 = 68.0;

/// The FIXED on-screen rect (logical points, window top-left + size) for the
/// collapsed dot tab: flush to the RIGHT edge, vertically centered — Grammarly
/// style. Completely independent of the selection, so the dot never moves.
fn fixed_dot_window_rect(app: &tauri::AppHandle) -> (f64, f64, f64, f64) {
    let (w, h) = (SELECTOR_TAB_W, SELECTOR_TAB_H);
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let min_x = position.x as f64 / scale;
        let min_y = position.y as f64 / scale;
        let sw = size.width as f64 / scale;
        let sh = size.height as f64 / scale;
        // Window right edge == screen right edge, so the tab sits flush against it.
        let x = (min_x + sw - w).round();
        // Vertically centered.
        let y = (min_y + (sh - h) / 2.0).round();
        (x, y, w, h)
    } else {
        (0.0, 0.0, w, h)
    }
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

    // A long, letter-dominated block is PROSE even with incidental numbers, ranges
    // ("3-5"), times ("1:1"), dates ("10/05") or prices ("$4k") — the kind of thing
    // that fills real WhatsApp/Telegram/Slack messages. For such text we skip the
    // single-token numeric/design checks below; the density checks here plus the
    // code-keyword / operator-sequence checks still catch genuine code/data.
    let word_count = s.split_whitespace().count();
    let long_prose = word_count >= 6 && letters / len >= 0.7;

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

    // 5 & 6: single-token numeric / design checks — applied to SHORT text only.
    // A long prose paragraph (a real message) skips these, so an incidental "=",
    // date, time, price, or CSS-looking unit can't disqualify genuine writing.
    if !long_prose {
        // 5. arithmetic / equations: any "=", or "number op number".
        // NOTE: "-" and "/" are deliberately NOT operators — ranges/hyphens
        // ("3-5 bonuses"), ratios ("10/10"), and "24/7" are everywhere in prose.
        // Genuine arithmetic with them ("10/2") is still caught by digit-density.
        if s.contains('=') {
            return true;
        }
        let is_op = |c: char| "+*^×÷".contains(c);
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
    } // end: short-text-only numeric/design checks

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
        if letter_len < 2 {
            return false;
        }
        // Must be essentially all letters — rejects stubs like "v2", "px", "h1"
        // and URLs/handles ("foo.com").
        if (letter_len as f64) / (word_len as f64) < 0.8 {
            return false;
        }
        // ALL-CAPS / acronym
        if letters == letters.to_uppercase() {
            return false;
        }
        // Capitalized words (incl. names) are intentionally ALLOWED — the tab
        // should appear for any real word, predictably. Over-rejecting a word the
        // user clearly selected is worse than occasionally offering on a name.
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
    // … and needs at least one real alphabetic word (≥2 letters), so short valid
    // phrases like "a cat" / "I am" qualify (they were wrongly rejected when this
    // required two such words) while pure number/symbol runs still don't.
    let wordy = words
        .iter()
        .filter(|w| w.chars().filter(|c| c.is_ascii_alphabetic()).count() >= 2)
        .count();
    wordy >= 1
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

/// Place the transparent selector window so its visible panel floats just inside
/// the RIGHT screen edge, vertically centered — opening leftward into the screen
/// from where the dot tab sits. Position is FIXED (never derived from the
/// selection), so the panel never jumps and never clips on the right edge.
///
/// The window is sized to the panel's actual height (`panel_height`, measured by
/// the frontend) plus vertical padding for the drop shadow, and vertically
/// centered on screen so the panel's centre lines up with the dot tab's centre.
fn place_selector_panel(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    _selection: &DesktopSelection,
    panel_height: f64,
) -> Result<(), String> {
    let width = 480.0;
    // Gap between the window's right edge and the screen's right edge. The panel
    // is right-aligned inside the window with its own `p-3`, so the visible card
    // ends up ~`right_margin + 12px` in from the edge — comfortably unclipped.
    let right_margin = 14.0;
    // Transparent room above and below the panel so the drop shadow isn't clipped.
    let vpad = 16.0;
    // Floor the height so the window is ALWAYS tall enough for the tallest stage
    // (the result view), avoiding a clip during a stage-transition resize.
    let panel_height = panel_height.clamp(MIN_PANEL_HEIGHT, 700.0);
    let window_height = panel_height + vpad * 2.0;

    let (mut x, mut y) = (right_margin, vpad);
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        let min_x = position.x as f64 / scale;
        let min_y = position.y as f64 / scale;
        let sw = size.width as f64 / scale;
        let sh = size.height as f64 / scale;
        // Right edge of the window sits `right_margin` in from the screen edge;
        // the panel opens leftward from there.
        x = (min_x + sw - width - right_margin).max(min_x);
        // Vertically centered on screen.
        y = (min_y + (sh - window_height) / 2.0).max(min_y);
    }

    debug_log(&format!(
        "place_panel panel_h={:.0} -> window={:.0}x{:.0} at ({:.0},{:.0}) [fixed right-edge]",
        panel_height,
        width,
        window_height,
        x.round(),
        y.round()
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

/// True if the selector was active within the last ~3.5s — i.e. a `Reopen` right
/// now is almost certainly an artifact of the overlay hiding, not a real dock
/// click, so we should not surface the editor window. The window is generous
/// because the OS can fire the spurious Reopen a beat after the hide (e.g. after
/// the copy/accept clipboard work), and a too-tight 2s window let the editor
/// pop up when the user lingered on the result before acting.
fn selector_recently_active(state: &SelectorState) -> bool {
    state
        .last_selector_activity
        .lock()
        .ok()
        .and_then(|at| *at)
        .map(|at| at.elapsed() < Duration::from_millis(6000))
        .unwrap_or(false)
}

#[tauri::command]
fn hide_selector_window(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
) -> Result<(), String> {
    // The app the selected text lives in — we hand focus back to it on close (below).
    let source_pid = state
        .selection
        .lock()
        .ok()
        .and_then(|s| s.as_ref().and_then(|sel| sel.source_pid));

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

    // If huu is STILL the frontmost app once the panel is gone (i.e. the user
    // closed it from within the overlay — cross, backdrop, or a click that kept
    // huu active — rather than by switching to another app), huu's editor window
    // would surface next (Reopen / window cycling). Hand focus back to the app the
    // text was selected in so huu drops to the background and the editor never
    // pops. If the user closed by clicking INTO another app, that app is already
    // frontmost (not huu), so we leave their focus exactly where they put it.
    #[cfg(target_os = "macos")]
    if platform_frontmost_pid() == Some(std::process::id() as i32) {
        if let Some(pid) = source_pid {
            let _ = activate_source_process(pid);
        }
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
    drop(slot);
    state
        .token_generation
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
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

/// Mint a FRESH session token on demand. Clerk session tokens live ~60s and the
/// editor's background pump can be throttled to >60s when its window is hidden
/// (the normal state while you're using the selector in another app), so the
/// cached token may be stale right when the selector needs it. This asks the
/// authenticated editor window to mint a new token NOW (via the `huu://mint-token`
/// event), waits briefly for it to push one back, and returns whatever we have.
/// Falls back to the cached token on timeout so a momentarily-unresponsive editor
/// never blocks a rewrite outright.
// NOTE: `async` is load-bearing. Synchronous Tauri commands run on the MAIN
// thread, and this one blocks up to ~2.5s waiting for the editor to mint a token.
// When it was sync and warmed from `openOptions`, it stalled the main thread so
// the very next command — `expand_selector_window` — couldn't run, and the tone
// bar took 2-4s to appear. As an async command it runs off the main thread, so
// the panel opens instantly while the token warms in the background.
#[tauri::command]
async fn refresh_session_token(
    app: tauri::AppHandle,
    state: State<'_, SelectorState>,
) -> Result<Option<String>, String> {
    use std::sync::atomic::Ordering;

    let start_gen = state.token_generation.load(Ordering::Relaxed);
    // Wake the editor window and ask it to mint a fresh token immediately.
    let _ = app.emit_to("main", "huu-mint-token", ());

    // Poll for the editor's response for up to ~2.5s. The generation counter
    // bumps as soon as `set_session_token` runs, so we return the instant a
    // fresh token lands rather than always waiting the full timeout. The window
    // is generous because a hidden editor webview may be slow to wake.
    let deadline = Instant::now() + Duration::from_millis(2500);
    while Instant::now() < deadline {
        if state.token_generation.load(Ordering::Relaxed) != start_gen {
            break;
        }
        std::thread::sleep(Duration::from_millis(40));
    }

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
        .inner_size(SELECTOR_TAB_W, SELECTOR_TAB_H)
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
#[cfg(any(target_os = "macos", target_os = "windows"))]
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
/// (Windows only — the macOS worker no longer hides on click, so it doesn't need
/// to special-case clicks on the dot.)
#[cfg(target_os = "windows")]
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
        // up_x/up_y, the gesture sequence number at release time, the native
        // click count (1=single, 2=double, 3=triple…) and whether Shift was held.
        // The latter two let us recognise a text selection made WITHOUT dragging —
        // double/triple-click or shift-click — which a pure distance check misses.
        Up(f64, f64, u64, i64, bool),
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

            // Where the most recent left-press landed — the drag ANCHOR. Used only
            // to classify the gesture (drag vs. click); the dot's POSITION no longer
            // depends on it (the dot is a fixed right-edge tab).
            let mut last_down = (0.0_f64, 0.0_f64);
            // The pid of the app whose selection the tab is currently showing for.
            // The tab floats persistently while this is set — switching apps/windows
            // never hides it, because a click elsewhere can't un-highlight this app's
            // text. It's only cleared (and the tab hidden) when a plain click back IN
            // this same app is found to have cleared the selection (see the mouse-up
            // handler). That is the single "text un-highlighted" signal.
            let mut armed_pid: Option<i32> = None;

            while let Ok(sig) = rx.recv() {
                let popup_open = state.popup_open.lock().map(|o| *o).unwrap_or(false);
                match sig {
                    MouseSignal::Down(x, y) => {
                        // Only record the press point for gesture classification on
                        // the matching mouse-up. We deliberately do NOT hide the tab
                        // here — it must persist until the selection is actually
                        // cleared, which we can only confirm on mouse-up.
                        last_down = (x, y);
                    }
                    MouseSignal::Up(up_x, up_y, up_seq, clicks, shift) => {
                        if popup_open {
                            continue;
                        }
                        // Short settle pause: let the selection finalize and debounce
                        // rapid gestures, but stay snappy. If anything else happened
                        // in that window, this gesture was superseded — bail.
                        std::thread::sleep(Duration::from_millis(250));
                        if seq.load(Ordering::Relaxed) != up_seq {
                            continue;
                        }

                        // Classify the gesture FIRST, straight off the mouse (no probe
                        // needed). A text selection is made three ways and we must catch
                        // ALL of them: a DRAG (>6px), a MULTI-CLICK (double = word,
                        // triple = line; the mouse barely moves), or a SHIFT-CLICK
                        // (extends the selection). Anything else is a plain click.
                        let dx = up_x - last_down.0;
                        let dy = up_y - last_down.1;
                        let was_drag = (dx * dx + dy * dy).sqrt() > 6.0;
                        let was_multi_click = clicks >= 2;
                        let is_selection_gesture = was_drag || was_multi_click || shift;

                        if !is_selection_gesture {
                            // A plain click. In the app the tab is armed for, a plain
                            // click collapses the selection — the user just UN-HIGHLIGHTED
                            // the text — so hide the tab promptly. We deliberately do NOT
                            // re-read the selection here: the AX tree keeps reporting the
                            // just-cleared selection for a beat (stale), and trusting it
                            // is exactly what left the tab floating over un-highlighted
                            // text. The mouse-up itself is the reliable "unselected" cue.
                            // A click in any OTHER app can't clear this app's selection,
                            // so there the tab keeps floating.
                            if armed_pid.is_some() && platform_frontmost_pid() == armed_pid {
                                hide_selector_dot(&app, &state);
                                armed_pid = None;
                            }
                            continue;
                        }

                        // SHOW path: this gesture made a selection — probe for its TEXT.
                        // PREFER the accessibility tree; one retry for apps slow to
                        // publish it.
                        let mut probe = platform_current_selection_probe();
                        if probe.status != "huu-self-focused" && !is_probe_rephrashable(&probe) {
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

                        // Resolve the selection TEXT. PREFER the accessibility tree;
                        // if it found nothing, fall back to a clipboard ⌘C probe —
                        // the universal way to read a selection canvas/web editors
                        // (Google Docs) can't expose through AX. We only need the
                        // text + can_replace here; the dot's POSITION is fixed, so no
                        // selection geometry is read or used anywhere anymore.
                        let sel = if is_probe_rephrashable(&probe) {
                            probe.selection.expect("rephrashable implies Some")
                        } else {
                            match recover_selection_via_clipboard() {
                                Some(text) if is_rephrashable(&text) => {
                                    // The ~140ms copy is a window in which the user may
                                    // have clicked again or opened the panel — re-check
                                    // before committing to show the dot.
                                    if seq.load(Ordering::Relaxed) != up_seq
                                        || state
                                            .popup_open
                                            .lock()
                                            .map(|o| *o)
                                            .unwrap_or(false)
                                    {
                                        continue;
                                    }
                                    debug_log(&format!(
                                        "clipboard-recovered selection len={}",
                                        text.len()
                                    ));
                                    DesktopSelection {
                                        text,
                                        x: 0.0,
                                        y: 0.0,
                                        width: 0.0,
                                        height: 0.0,
                                        source_pid: platform_frontmost_pid(),
                                        can_replace: true,
                                    }
                                }
                                _ => {
                                    hide_selector_dot(&app, &state);
                                    continue;
                                }
                            }
                        };

                        // Position is FIXED (right-edge tab) — show_selector_for_selection
                        // ignores sel's coordinates entirely. Arm the tab for this
                        // app so it persists across focus changes (see Focus arm).
                        armed_pid = sel.source_pid.or_else(platform_frontmost_pid);
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
            CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
            CGEventType, EventField,
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
                    CGEventType::LeftMouseUp => {
                        // macOS reports the click multiplicity directly on the
                        // event (double-click = 2, triple = 3). Combined with the
                        // Shift flag, this is how we detect a no-drag selection.
                        let clicks =
                            event.get_integer_value_field(EventField::MOUSE_EVENT_CLICK_STATE);
                        let shift = event.get_flags().contains(CGEventFlags::CGEventFlagShift);
                        tx.send(MouseSignal::Up(p.x, p.y, v, clicks, shift))
                    }
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

// Windows: statics for the low-level mouse hook callback (extern "system" fns
// can't close over Rust state, so we store the channel sender and sequence
// counter in module-level statics).
#[cfg(target_os = "windows")]
static WIN_HOOK_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
// payload: (kind, x, y, seq) where kind 0 = mouse-down, 1 = mouse-up
#[cfg(target_os = "windows")]
static WIN_HOOK_TX: std::sync::OnceLock<
    std::sync::mpsc::SyncSender<(u8, f64, f64, u64)>,
> = std::sync::OnceLock::new();

// Windows: event-driven selector using WH_MOUSE_LL — the Win32 equivalent of
// the macOS CGEventTap. Same worker-thread logic, same gesture-direction math.
#[cfg(target_os = "windows")]
fn start_selection_watcher(app: tauri::AppHandle) {
    use std::sync::atomic::Ordering;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, HC_ACTION,
        MSLLHOOKSTRUCT, MSG, WH_MOUSE_LL, WM_LBUTTONDOWN, WM_LBUTTONUP,
    };

    let (tx, rx) = std::sync::mpsc::sync_channel::<(u8, f64, f64, u64)>(64);
    let _ = WIN_HOOK_TX.set(tx);

    // Worker thread — mirrors the macOS worker verbatim.
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let state = app.state::<SelectorState>();
            if let Ok(mut running) = state.watcher_running.lock() {
                *running = true;
            }
            debug_log("mouse-driven selector worker started (windows)");

            let mut last_down = (0.0_f64, 0.0_f64);
            // Time + position of the previous mouse-up, used to recognise a
            // double/triple-click (a no-drag selection) the way macOS reads the
            // native click count. Two ups close together in time and space mean a
            // multi-click word/line/paragraph selection.
            let mut last_up: Option<(Instant, f64, f64)> = None;

            while let Ok((kind, ex, ey, up_seq)) = rx.recv() {
                let popup_open = state.popup_open.lock().map(|o| *o).unwrap_or(false);

                if kind == 0 {
                    // Mouse-down
                    last_down = (ex, ey);
                    if popup_open { continue; }
                    if point_in_dot_frame(&state, ex, ey) { continue; }
                    hide_selector_dot(&app, &state);
                    continue;
                }

                // Mouse-up (kind == 1)
                if popup_open { continue; }
                // Detect a multi-click BEFORE the settle sleep, comparing this up to
                // the previous one (same spot, <500ms apart = double/triple-click).
                let now = Instant::now();
                let was_multi_click = last_up
                    .map(|(t, px, py)| {
                        now.duration_since(t) < Duration::from_millis(500)
                            && ((ex - px).powi(2) + (ey - py).powi(2)).sqrt() < 6.0
                    })
                    .unwrap_or(false);
                last_up = Some((now, ex, ey));
                std::thread::sleep(Duration::from_millis(250));
                if WIN_HOOK_SEQ.load(Ordering::Relaxed) != up_seq { continue; }

                let mut probe = platform_current_selection_probe();
                if probe.status != "huu-self-focused" && !is_probe_rephrashable(&probe) {
                    std::thread::sleep(Duration::from_millis(150));
                    if WIN_HOOK_SEQ.load(Ordering::Relaxed) != up_seq { continue; }
                    probe = platform_current_selection_probe();
                }

                if let Ok(mut last_status) = state.last_status.lock() {
                    *last_status = probe.status.clone();
                }

                if probe.status == "huu-self-focused" { continue; }
                if state.popup_open.lock().map(|o| *o).unwrap_or(false) { continue; }

                let dx = ex - last_down.0;
                let dy = ey - last_down.1;
                let was_drag = (dx * dx + dy * dy).sqrt() > 6.0;
                let is_selection_gesture = was_drag || was_multi_click;

                // HARD PRECONDITION (mirrors macOS): the dot only ever appears in
                // response to a selection the user JUST made. It must NEVER respawn
                // merely because a stale selection still exists — returning to a
                // window fires a plain refocus click whose accessibility data is
                // stale/garbage. A refocus click is not a selection gesture, so bail.
                if !is_selection_gesture {
                    hide_selector_dot(&app, &state);
                    continue;
                }

                // Resolve the selection TEXT only (the dot position is a fixed
                // right-edge tab). Prefer the UI Automation probe; fall back to a
                // clipboard read so canvas/web editors (Google Docs) that expose no
                // selection text still get the dot. Mirrors the macOS worker.
                let sel = if is_probe_rephrashable(&probe) {
                    probe.selection.expect("rephrashable implies Some")
                } else {
                    match recover_selection_via_clipboard() {
                        Some(text) if is_rephrashable(&text) => {
                            if WIN_HOOK_SEQ.load(Ordering::Relaxed) != up_seq
                                || state.popup_open.lock().map(|o| *o).unwrap_or(false)
                            {
                                continue;
                            }
                            debug_log(&format!(
                                "clipboard-recovered selection len={}",
                                text.len()
                            ));
                            DesktopSelection {
                                text,
                                x: 0.0,
                                y: 0.0,
                                width: 0.0,
                                height: 0.0,
                                source_pid: platform_frontmost_pid(),
                                can_replace: true,
                            }
                        }
                        _ => {
                            hide_selector_dot(&app, &state);
                            continue;
                        }
                    }
                };

                // Position is FIXED (right-edge tab) — coordinates on `sel` are ignored.
                if let Err(err) = show_selector_for_selection(&app, &state, sel) {
                    debug_log(&format!("show selector failed: {err}"));
                }
            }
        });
    }

    // Hook thread: installs WH_MOUSE_LL and pumps the Windows message loop.
    // The hook callback is an extern "system" fn (no closure) and reads from
    // the module-level statics above.
    std::thread::spawn(move || {
        unsafe extern "system" fn mouse_hook_proc(
            code: i32,
            wparam: WPARAM,
            lparam: LPARAM,
        ) -> LRESULT {
            if code == HC_ACTION as i32 {
                let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
                let x = info.pt.x as f64;
                let y = info.pt.y as f64;
                let msg = wparam.0 as u32;
                let kind = match msg {
                    WM_LBUTTONDOWN => Some(0u8),
                    WM_LBUTTONUP => Some(1u8),
                    _ => None,
                };
                if let Some(kind) = kind {
                    let v = WIN_HOOK_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
                    if let Some(tx) = WIN_HOOK_TX.get() {
                        let _ = tx.try_send((kind, x, y, v));
                    }
                }
            }
            CallNextHookEx(None, code, wparam, lparam)
        }

        unsafe {
            let hook = match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook_proc), None, 0) {
                Ok(h) => h,
                Err(e) => {
                    debug_log(&format!("mouse hook install failed: {e}"));
                    return;
                }
            };
            debug_log("windows low-level mouse hook installed");
            let mut msg = MSG::default();
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = windows::Win32::UI::WindowsAndMessaging::TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = windows::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(hook);
        }
    });
}

// Linux / other non-Windows, non-macOS: keep the old polling watcher as a stub.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
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

        debug_log("selection watcher started (polling)");

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
            if shown { continue; }

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

/// Recover the selected TEXT through the clipboard when the accessibility tree
/// exposes nothing. This is the ONLY way to read selections in canvas / web
/// editors — Google Docs above all, but also Figma, Canva, and similar — which
/// draw their text on a `<canvas>` and never publish `AXSelectedText` / UIA text,
/// so the normal tree walk sees "no selection" even when a paragraph is clearly
/// highlighted.
///
/// Sends a synthetic ⌘C / Ctrl+C, reads what landed on the clipboard, then
/// restores the user's previous clipboard so the probe is invisible. Returns the
/// copied text (trimmed) only when the copy actually changed the clipboard.
/// The caller MUST only invoke this after a real selection gesture (drag,
/// double/triple-click, or shift-click), so we never fire a copy on a plain
/// single click.
fn recover_selection_via_clipboard() -> Option<String> {
    let previous = get_clipboard_text().unwrap_or_default();
    if send_copy_shortcut().is_err() {
        return None;
    }

    // Canvas/rich editors (Google Docs, Notion, Slides) serialize the selection
    // onto the pasteboard at wildly different speeds depending on how much was
    // selected: a single sentence lands in well under 100ms, but a full
    // multi-line paragraph can take 300ms+. A single fixed sleep was the root of
    // the "first sentence shows the dot, whole paragraph doesn't" bug — the read
    // fired before the slow copy had landed, came back as the OLD clipboard (or
    // empty), and we bailed. Poll instead: wait until the pasteboard actually
    // CHANGES from what was there before, up to a generous budget.
    let deadline = Instant::now() + Duration::from_millis(650);
    let copied = loop {
        std::thread::sleep(Duration::from_millis(25));
        let current = get_clipboard_text().unwrap_or_default();
        // The copy has landed once the pasteboard holds non-empty content that
        // differs from the pre-copy contents.
        if !current.trim().is_empty() && current != previous {
            break current;
        }
        if Instant::now() >= deadline {
            // The pasteboard never changed within the budget. Because the probe
            // now fires on every selection gesture (drag, double/triple-click,
            // shift-click), a no-change result means the gesture did NOT copy any
            // text — e.g. a double-click on whitespace or an empty paragraph. We
            // have no evidence of a selection, so show no dot rather than fall back
            // to the stale clipboard (which would pop a button on nothing). The
            // only thing this gives up is the rare case where the selected text is
            // byte-identical to what was already on the clipboard — an acceptable
            // miss in exchange for never showing a false button. Clipboard is
            // unchanged, so nothing to restore.
            return None;
        }
    };

    // Restore the user's clipboard. We only ever break out of the loop above with
    // content that differs from `previous`, so `previous != copied` always holds
    // here; restore it whenever there was something to put back.
    if !previous.is_empty() {
        let _ = set_clipboard_text(previous);
    }

    let trimmed = copied.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// PID of the frontmost application, used as the paste-back target for a
/// clipboard-recovered selection (the accessibility probe that would normally
/// supply `source_pid` returned nothing). macOS reads it from the AX focused
/// application; other platforms return None (paste-back falls back to the
/// currently focused window).
#[cfg(target_os = "macos")]
fn platform_frontmost_pid() -> Option<i32> {
    macos_accessibility::frontmost_app_pid()
}

#[cfg(not(target_os = "macos"))]
fn platform_frontmost_pid() -> Option<i32> {
    None
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
        url::CFURL,
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

    /// PID of the frontmost (focused) application. Used to target paste-back for a
    /// clipboard-recovered selection, where the normal selection read returned
    /// nothing and therefore carried no source PID.
    pub fn frontmost_app_pid() -> Option<i32> {
        if !is_trusted(false) {
            return None;
        }
        unsafe {
            let system = AXUIElementCreateSystemWide();
            if system.is_null() {
                return None;
            }
            AXUIElementSetMessagingTimeout(system, 0.25);
            let app = copy_attribute(system, "AXFocusedApplication");
            CFRelease(system as CFTypeRef);
            let app = app?;
            let pid = copy_element_pid(app as AXUIElementRef);
            CFRelease(app);
            pid
        }
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

            // HUUMANITY-SITE GUARD. The user can run the desktop app AND use the
            // site (huumanity.app/editor) in a browser at the same time. When
            // they select text on that page, the page already has its OWN
            // in-editor tab — the global selector must NOT double up, fire a ⌘C
            // probe, or activate huu's window over the browser (that focus-steal
            // was breaking the page's own Accept/Copy and popping huu's window).
            // Reuse the self-focus sentinel so every existing guard treats it the
            // same: skip silently, show nothing. Best-effort — if the URL can't
            // be read we fall through and behave exactly as before.
            if let Some(url) = focused_page_url(focused as AXUIElementRef) {
                if url.to_ascii_lowercase().contains("huumanity") {
                    CFRelease(focused);
                    return SelectionProbe {
                        selection: None,
                        status: "huu-self-focused".to_string(),
                    };
                }
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

    /// The URL of the web page that owns `focused`, if it's web content. The URL
    /// lives on the AXWebArea, an ancestor of the focused text element, exposed
    /// as `AXURL` (a CFURL) or sometimes `AXDocument` (a string). Walk up the
    /// parent chain and return the first one we find. Used to recognize when a
    /// selection is happening on huumanity's own site so the global selector can
    /// stand down (the site already has its own in-editor tab). Best-effort:
    /// returns None for native apps or anything that doesn't expose a URL.
    unsafe fn focused_page_url(focused: AXUIElementRef) -> Option<String> {
        let mut current = focused;
        let mut owned: Vec<CFTypeRef> = Vec::new();
        let mut result: Option<String> = None;

        for _ in 0..10 {
            if let Some(value) = copy_attribute(current, "AXURL") {
                let cf_type = CFType::wrap_under_create_rule(value);
                if let Some(url) = cf_type.downcast::<CFURL>() {
                    result = Some(url.get_string().to_string());
                } else if let Some(s) = cf_type.downcast::<CFString>() {
                    result = Some(s.to_string());
                }
                if result.as_deref().is_some_and(|s| !s.is_empty()) {
                    break;
                }
            }
            if let Some(doc) = copy_attribute_string(current, "AXDocument") {
                if !doc.is_empty() {
                    result = Some(doc);
                    break;
                }
            }
            let Some(parent) = copy_attribute(current, "AXParent") else {
                break;
            };
            owned.push(parent);
            current = parent as AXUIElementRef;
        }

        owned.iter().for_each(|r| CFRelease(*r));
        result
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
                    TextPatternRangeEndpoint_End, TextPatternRangeEndpoint_Start,
                    TextUnit_Character, UIA_TextPatternId,
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

    /// Returns the screen coordinate of the selection's TRUE END — the right edge
    /// of the last char in document order (`ends_at_end = true`). UIA text ranges
    /// are always document-ordered, so this is identical regardless of drag
    /// direction. Same contract as the macOS `selection_endpoint`. Returns `None`
    /// when UIA reports no selection or the element doesn't support the Text
    /// pattern — the caller then resolves the end from selection geometry.
    pub fn selection_endpoint(ends_at_end: bool) -> Option<(f64, f64)> {
        ensure_com();
        unsafe {
            let automation: IUIAutomation =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
            let element = automation.GetFocusedElement().ok()?;

            // Ignore our own windows.
            let pid = element.CurrentProcessId().ok()? as u32;
            if pid == std::process::id() {
                return None;
            }

            let pattern_unk = element.GetCurrentPattern(UIA_TextPatternId).ok()?;
            let text_pattern: IUIAutomationTextPattern = pattern_unk.cast().ok()?;

            let selection_array = text_pattern.GetSelection().ok()?;
            if selection_array.Length().ok()? == 0 {
                return None;
            }
            let full_range = selection_array.GetElement(0).ok()?;

            // Clone the full range and collapse it to a single character at the
            // desired end using MoveEndpointByUnit.
            let one_char = full_range.Clone().ok()?;

            if ends_at_end {
                // Move start to the end, then back one character so we have
                // a 1-char range covering the last character of the selection.
                one_char
                    .MoveEndpointByUnit(
                        TextPatternRangeEndpoint_Start,
                        TextUnit_Character,
                        1_000_000,
                    )
                    .ok()?;
                one_char
                    .MoveEndpointByUnit(
                        TextPatternRangeEndpoint_Start,
                        TextUnit_Character,
                        -1,
                    )
                    .ok()?;
            } else {
                // Move end to the start, then forward one character so we have
                // a 1-char range covering the first character of the selection.
                one_char
                    .MoveEndpointByUnit(
                        TextPatternRangeEndpoint_End,
                        TextUnit_Character,
                        -1_000_000,
                    )
                    .ok()?;
                one_char
                    .MoveEndpointByUnit(
                        TextPatternRangeEndpoint_End,
                        TextUnit_Character,
                        1,
                    )
                    .ok()?;
            }

            // Read the bounding rect of the 1-char range — first rect in the array.
            let sa = one_char.GetBoundingRectangles().ok()?;
            if sa.is_null() {
                return None;
            }
            let lb = SafeArrayGetLBound(sa, 1).ok()?;
            let ub = SafeArrayGetUBound(sa, 1).ok()?;
            if ub - lb + 1 < 4 {
                return None;
            }
            let mut raw: *mut std::ffi::c_void = std::ptr::null_mut();
            SafeArrayAccessData(sa, &mut raw).ok()?;
            if raw.is_null() {
                return None;
            }
            let count = (ub - lb + 1) as usize;
            let slice = std::slice::from_raw_parts(raw as *const f64, count);
            // rect: [left, top, width, height]
            let (left, top, width, height) = (slice[0], slice[1], slice[2], slice[3]);
            let _ = SafeArrayUnaccessData(sa);

            // Return the correct edge, vertically centered on the character.
            let cy = top + height / 2.0;
            if ends_at_end {
                Some((left + width, cy)) // right edge of last char
            } else {
                Some((left, cy)) // left edge of first char
            }
        }
    }
}
