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
            ensure_selector_window(app.handle())?;
            start_selection_watcher(app.handle().clone());

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
    text: String,
    source_pid: Option<i32>,
) -> Result<(), String> {
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
        .set_size(LogicalSize::new(48.0, 48.0))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x as f64, y as f64))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

fn selector_button_position(app: &tauri::AppHandle, selection: &DesktopSelection) -> (i32, i32) {
    // Place button above the selection, left-aligned with it.
    // 48px button + 10px gap above the top edge of the selection rect.
    let mut x = selection.x;
    let mut y = selection.y - 48.0 - 10.0;

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();

        let min_x = position.x as f64 / scale;
        let min_y = position.y as f64 / scale;
        let max_x = min_x + (size.width as f64 / scale) - 56.0;
        let max_y = min_y + (size.height as f64 / scale) - 56.0;

        x = x.clamp(min_x + 8.0, max_x.max(min_x + 8.0));
        y = y.clamp(min_y + 8.0, max_y.max(min_y + 8.0));
    } else {
        x = x.max(8.0);
        y = y.max(8.0);
    }

    (x.round() as i32, y.round() as i32)
}

/// Mirror of the TypeScript `isRephrashable` ground rule.
/// Single uppercase-initial word → proper noun → false.
/// Single ALL-CAPS word → acronym → false.
/// Single word < 3 letters → false.
/// Multi-word → pass if ≥50 % of non-space chars are letters.
fn is_rephrashable(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    let words: Vec<&str> = trimmed.split_whitespace().collect();

    if words.len() == 1 {
        let word = words[0];
        let letters: String = word.chars().filter(|c| c.is_alphabetic()).collect();
        if letters.len() < 3 {
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

    // Multi-word: letter ratio check
    let non_space: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    if non_space.is_empty() {
        return false;
    }
    let letter_count = non_space.chars().filter(|c| c.is_alphabetic()).count();
    letter_count as f64 / non_space.len() as f64 >= 0.50
}

fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = if let Some(window) = app.get_webview_window("main") {
        window
    } else {
        WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/editor".into()))
            .title("huumanity")
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

    let window = ensure_selector_window(&app)?;
    let width = 460;
    let height = 320;
    let x = (selection.x + (selection.width / 2.0) - (width as f64 / 2.0))
        .max(0.0)
        .round() as i32;
    let y = (selection.y - height as f64 - 12.0).max(0.0).round() as i32;

    window
        .set_size(LogicalSize::new(width as f64, height as f64))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x as f64, y as f64))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_selector_window(app: tauri::AppHandle) -> Result<(), String> {
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

    WebviewWindowBuilder::new(app, "selector", WebviewUrl::App("/selector".into()))
        .title("huu selector")
        .inner_size(48.0, 48.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .visible(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())
}

fn start_selection_watcher(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_selection_key = String::new();
        let mut last_probe_status = String::new();
        // How many consecutive polls must see the same selection before we show
        // the button. At 350 ms per poll this is ~700 ms of stability — the
        // cursor must have stopped moving before the button appears.
        const STABLE_POLLS_REQUIRED: u32 = 2;
        let mut stable_count: u32 = 0;
        let mut pending_selection: Option<DesktopSelection> = None;

        let state = app.state::<SelectorState>();
        if let Ok(mut watcher_running) = state.watcher_running.lock() {
            *watcher_running = true;
        }

        debug_log("selection watcher started");

        loop {
            std::thread::sleep(Duration::from_millis(350));

            let probe = platform_current_selection_probe();
            if probe.status != last_probe_status {
                debug_log(&probe.status);
                if let Ok(mut last_status) = state.last_status.lock() {
                    *last_status = probe.status.clone();
                }
                last_probe_status = probe.status.clone();
            }

            let Some(selection) = probe.selection else {
                // No selection — reset and hide any visible button
                if !last_selection_key.is_empty() {
                    last_selection_key.clear();
                    stable_count = 0;
                    pending_selection = None;
                    if let Some(window) = app.get_webview_window("selector") {
                        let _ = window.hide();
                    }
                }
                continue;
            };

            let trimmed = selection.text.trim().to_string();
            if trimmed.is_empty() {
                continue;
            }

            // Ground rule: skip proper nouns, acronyms, short words
            if !is_rephrashable(&trimmed) {
                if !last_selection_key.is_empty() {
                    last_selection_key.clear();
                    stable_count = 0;
                    pending_selection = None;
                    if let Some(window) = app.get_webview_window("selector") {
                        let _ = window.hide();
                    }
                }
                continue;
            }

            let selection_key = format!(
                "{}:{}:{}:{}:{}",
                trimmed,
                selection.x.round(),
                selection.y.round(),
                selection.width.round(),
                selection.height.round()
            );

            if selection_key != last_selection_key {
                // Selection changed — restart stability counter, store candidate
                last_selection_key = selection_key;
                stable_count = 1;
                pending_selection = Some(selection);
            } else {
                // Same selection as last poll — increment stability
                stable_count += 1;

                if stable_count == STABLE_POLLS_REQUIRED {
                    // Selection has been stable for ~700 ms — show the button
                    if let Some(sel) = pending_selection.take() {
                        if let Err(err) = show_selector_for_selection(&app, &state, sel) {
                            debug_log(&format!("show selector failed: {err}"));
                        }
                    }
                }
                // Beyond STABLE_POLLS_REQUIRED: already showing, do nothing
            }
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
        fn AXValueGetValue(value: AXValueRef, value_type: i32, value_ptr: *mut c_void) -> Boolean;
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

            let focused = copy_focused_element(system);
            CFRelease(system as CFTypeRef);

            let Some(focused) = focused else {
                return SelectionProbe {
                    selection: None,
                    status: "focused text element unavailable".to_string(),
                };
            };

            let source_pid = copy_element_pid(focused as AXUIElementRef);
            let selection_read = find_selection_in_element_tree(focused as AXUIElementRef, 3);
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
    ) -> Option<SelectionRead> {
        if let Some(selection) = read_selection_from_element(element) {
            return Some(selection);
        }

        if remaining_depth == 0 {
            return None;
        }

        for attr_name in ["AXFocusedUIElement", "AXParent"] {
            if let Some(related) = copy_attribute(element, attr_name) {
                let selection =
                    find_selection_in_element_tree(related as AXUIElementRef, remaining_depth - 1);
                CFRelease(related);
                if selection.is_some() {
                    return selection;
                }
            }
        }

        if let Some(children_ref) = copy_attribute(element, "AXChildren") {
            let children =
                CFArray::<*const c_void>::wrap_under_create_rule(children_ref as CFArrayRef);
            for child in children.get_all_values().into_iter().take(80) {
                if child.is_null() {
                    continue;
                }

                if let Some(selection) =
                    find_selection_in_element_tree(child as AXUIElementRef, remaining_depth - 1)
                {
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

        Some(SelectionRead {
            text,
            rect: copy_selection_rect(element),
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

    unsafe fn copy_selection_rect(element: AXUIElementRef) -> Option<CGRect> {
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

        let mut rect = CGRect::new(&Default::default(), &Default::default());
        let did_read = AXValueGetValue(
            bounds_ref as AXValueRef,
            AX_VALUE_CG_RECT,
            &mut rect as *mut CGRect as *mut c_void,
        );
        CFRelease(bounds_ref);

        if did_read == 0 {
            return None;
        }

        Some(rect)
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
