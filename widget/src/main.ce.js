/**
 * Widget bootstrap. Reads tenant + API base URL from the script tag that
 * loaded this file:
 *
 *   <script src="https://cdn.yours.com/widget.v1.js"
 *           data-tenant="acme"
 *           data-api-base="https://api.yours.com"
 *           data-position="bottom-right"
 *           async></script>
 *
 * Auto-mounts a <chatbot-widget> element into the page once the script loads.
 * If a <chatbot-widget> element already exists in the HTML, leaves it alone
 * but ensures its attributes are populated from the script tag.
 */
import { defineCustomElement } from "vue"
import ChatbotWidget from "./ChatbotWidget.ce.vue"

const TAG = "chatbot-widget"

if (!customElements.get(TAG)) {
    customElements.define(TAG, defineCustomElement(ChatbotWidget))
}

/**
 * Resolve config from the script tag that loaded this bundle.
 * Falls back to other tags with data-tenant in case the IIFE was loaded
 * via a bundler that strips currentScript.
 */
function readConfig() {
    const current =
        document.currentScript ||
        Array.from(document.scripts).reverse().find(s => /widget\.v1\.js/.test(s.src)) ||
        Array.from(document.querySelectorAll("script[data-tenant]"))[0]

    if (!current) return null

    const ds = current.dataset
    if (!ds.tenant) return null

    return {
        tenant: ds.tenant,
        apiBase: ds.apiBase || "",
        position: ds.position || "bottom-right",
        mode: ds.mode || "popup",       // popup | inline
        targetSelector: ds.target || null,
    }
}

/**
 * Mount the widget. Idempotent — safe to call multiple times.
 */
function mount() {
    const cfg = readConfig()
    if (!cfg) return

    // Inline mode: render inside a host element specified by selector.
    if (cfg.mode === "inline" && cfg.targetSelector) {
        const host = document.querySelector(cfg.targetSelector)
        if (!host) {
            console.warn(`[chatbot-widget] target not found: ${cfg.targetSelector}`)
            return
        }
        if (host.querySelector(TAG)) return  // already mounted
        const el = document.createElement(TAG)
        el.setAttribute("tenant", cfg.tenant)
        if (cfg.apiBase) el.setAttribute("api-base", cfg.apiBase)
        el.setAttribute("mode", "inline")
        host.appendChild(el)
        return
    }

    // Popup mode (default): floating button + panel, fixed to viewport.
    if (document.querySelector(TAG)) return  // already on page
    const el = document.createElement(TAG)
    el.setAttribute("tenant", cfg.tenant)
    if (cfg.apiBase) el.setAttribute("api-base", cfg.apiBase)
    el.setAttribute("position", cfg.position)
    el.setAttribute("mode", "popup")
    document.body.appendChild(el)
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true })
} else {
    mount()
}
