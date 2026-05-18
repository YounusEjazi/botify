<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue"
import { createClient } from "./api.js"

const props = defineProps({
    tenant:    { type: String, required: true },
    apiBase:   { type: String, default: "" },
    position:  { type: String, default: "bottom-right" },  // bottom-right | bottom-left
    mode:      { type: String, default: "popup" },         // popup | inline
})

// ─── State ─────────────────────────────────────────────────────────────
const config = ref(null)
const configError = ref(null)
const loadingConfig = ref(true)

const isOpen = ref(props.mode === "inline")
const messages = ref([])             // [{role, content, sources?, ticketPrefill?}]
const input = ref("")
const sending = ref(false)
const currentLanguage = ref(null)

const sessionId = ref(crypto.randomUUID?.() ?? `s_${Date.now()}`)
const scrollRef = ref(null)

// Ticket form state
const ticketOpen = ref(false)
const ticketPrefill = ref({ subject: "", description: "", name: "", email: "" })
const ticketSubmitting = ref(false)
const ticketResult = ref(null)

// Rating state — null = unrated, 1 = thumbs up, -1 = thumbs down
const rating = ref(null)

// ─── Bootstrap ────────────────────────────────────────────────────────
const client = computed(() =>
    createClient({ tenant: props.tenant, apiBase: props.apiBase })
)

onMounted(async () => {
    try {
        const cfg = await client.value.getConfig()
        config.value = cfg
        // Pick language from browser if supported, else tenant default.
        const browserLang = (navigator.language || "en").slice(0, 2).toLowerCase()
        currentLanguage.value = cfg.languages.includes(browserLang)
            ? browserLang
            : cfg.default_language
        const greeting = cfg.ui_strings?.[currentLanguage.value]?.greeting
        if (greeting) {
            messages.value.push({ role: "assistant", content: greeting })
        }
    } catch (err) {
        configError.value = err.message
    } finally {
        loadingConfig.value = false
    }
})

// Computed strings + theming
const strings = computed(() =>
    (config.value?.ui_strings?.[currentLanguage.value]) || {}
)
const title = computed(() =>
    strings.value.title || config.value?.branding?.display_name || config.value?.name || "Chat"
)
const placeholder = computed(() =>
    strings.value.placeholder || "Ask a question…"
)
const primaryColor = computed(() => config.value?.branding?.primary_color || "#5b58e0")
const logoUrl = computed(() => config.value?.branding?.logo_url || "")

// ─── Actions ──────────────────────────────────────────────────────────

function openChat() {
    isOpen.value = true
    nextTick(() => {
        scrollToBottom()
        document.querySelector("textarea.cw-input")?.focus()
    })
}

function closeChat() {
    isOpen.value = false
    ticketOpen.value = false
}

function scrollToBottom() {
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
}

async function send() {
    const text = input.value.trim()
    if (!text || sending.value) return

    messages.value.push({ role: "user", content: text })
    input.value = ""
    sending.value = true
    await nextTick(); scrollToBottom()

    try {
        const apiMessages = messages.value
            .filter(m => m.role === "user" || m.role === "assistant")
            .map(({ role, content }) => ({ role, content }))

        const resp = await client.value.chat({
            messages: apiMessages,
            language: currentLanguage.value,
            sessionId: sessionId.value,
        })

        if (resp.blocked) {
            messages.value.push({
                role: "assistant",
                content: blockMessage(resp.block_reason),
            })
        } else {
            messages.value.push({
                role: "assistant",
                content: resp.answer,
                sources: resp.sources?.length ? resp.sources : undefined,
            })

            // If the LLM called the ticket action, surface the form.
            const ticketAction = resp.actions?.find(
                a => a.result?.status === "form_required" && a.result?.prefill
            )
            if (ticketAction) {
                ticketPrefill.value = { ...ticketAction.result.prefill }
                ticketOpen.value = true
            }
        }
    } catch (err) {
        messages.value.push({
            role: "assistant",
            content: `Something went wrong. (${err.message})`,
        })
    } finally {
        sending.value = false
        await nextTick(); scrollToBottom()
    }
}

function blockMessage(reason) {
    const en = {
        nonsense: "I couldn't understand your message. Could you rephrase?",
        hate: "Let's keep the conversation respectful — please rephrase your question.",
        violence: "I can't help with that. Please rephrase your question.",
        prompt_attack: "I can only help with questions about our products and services.",
    }
    return en[reason] || "I can't help with that. Please rephrase your question."
}

async function submitTicket() {
    if (ticketSubmitting.value) return
    ticketSubmitting.value = true
    try {
        const chatHistory = messages.value
            .filter(m => m.role === "user" || m.role === "assistant")
            .map(m => `${m.role === "user" ? "Customer" : "Bot"}: ${m.content}`)
            .join("\n\n")

        const result = await client.value.submitTicket({
            ...ticketPrefill.value,
            chatHistory,
        })
        ticketResult.value = {
            ok: true,
            caseId: result.case_id,
            message: "Your ticket was submitted. We'll get back to you shortly.",
        }
    } catch (err) {
        ticketResult.value = { ok: false, message: err.message }
    } finally {
        ticketSubmitting.value = false
    }
}

function resetTicket() {
    ticketOpen.value = false
    ticketResult.value = null
    ticketPrefill.value = { subject: "", description: "", name: "", email: "" }
}

async function submitRating(value) {
    if (rating.value !== null) return
    rating.value = value
    try {
        await client.value.rate({ sessionId: sessionId.value, rating: value })
    } catch {
        // Rating is best-effort — don't surface errors to the user.
    }
}

watch(messages, () => nextTick(() => scrollToBottom()), { deep: true })
</script>

<template>
    <!-- Floating button (popup mode only) -->
    <button
        v-if="props.mode === 'popup' && !isOpen"
        class="cw-launcher"
        :class="position"
        :style="{ '--cw-primary': primaryColor }"
        @click="openChat"
        aria-label="Open chat"
    >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 11.5c0 4.7-4 8.5-9 8.5-1.3 0-2.5-.2-3.6-.7L3 21l1.7-5.4C3.6 14 3 12.8 3 11.5 3 6.8 7 3 12 3s9 3.8 9 8.5z"
                  stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
    </button>

    <!-- Panel -->
    <div
        v-if="isOpen"
        class="cw-panel"
        :class="[position, mode]"
        :style="{ '--cw-primary': primaryColor }"
        role="dialog"
        aria-label="Chat window"
    >
        <header class="cw-header">
            <div class="cw-header-left">
                <img v-if="logoUrl" :src="logoUrl" alt="" class="cw-logo"/>
                <div class="cw-title">{{ title }}</div>
            </div>
            <button
                v-if="props.mode === 'popup'"
                class="cw-close" @click="closeChat" aria-label="Close"
            >×</button>
        </header>

        <div v-if="loadingConfig" class="cw-loading">Loading…</div>
        <div v-else-if="configError" class="cw-error">
            Couldn't load chat: {{ configError }}
        </div>

        <template v-else>
            <main class="cw-messages" ref="scrollRef">
                <div
                    v-for="(m, i) in messages"
                    :key="i"
                    class="cw-msg"
                    :class="m.role"
                >
                    <div class="cw-msg-bubble" v-html="renderMarkdown(m.content)"/>
                    <details v-if="m.sources" class="cw-sources">
                        <summary>Sources ({{ m.sources.length }})</summary>
                        <ul>
                            <li v-for="(s, j) in m.sources" :key="j">
                                <a v-if="s.source_url" :href="s.source_url" target="_blank" rel="noopener">
                                    {{ s.title || s.source_url }}
                                </a>
                                <span v-else>{{ s.title || `Source ${j+1}` }}</span>
                            </li>
                        </ul>
                    </details>
                </div>
                <div v-if="sending" class="cw-msg assistant">
                    <div class="cw-msg-bubble cw-typing">
                        <span></span><span></span><span></span>
                    </div>
                </div>

                <!-- Rating buttons — shown after at least one bot reply, above the last message -->
                <div v-if="messages.some(m => m.role === 'assistant') && !sending" class="cw-rating">
                    <span class="cw-rating-label">Was this helpful?</span>
                    <button
                        class="cw-rating-btn"
                        :class="{ active: rating === 1, disabled: rating !== null }"
                        @click="submitRating(1)"
                        :disabled="rating !== null"
                        aria-label="Thumbs up"
                    >👍</button>
                    <button
                        class="cw-rating-btn"
                        :class="{ active: rating === -1, disabled: rating !== null }"
                        @click="submitRating(-1)"
                        :disabled="rating !== null"
                        aria-label="Thumbs down"
                    >👎</button>
                    <span v-if="rating !== null" class="cw-rating-thanks">Thanks!</span>
                </div>
            </main>

            <!-- Ticket form overlay -->
            <div v-if="ticketOpen" class="cw-ticket">
                <div v-if="ticketResult" class="cw-ticket-result" :class="{ ok: ticketResult.ok }">
                    <p>{{ ticketResult.message }}</p>
                    <p v-if="ticketResult.caseId" class="cw-case">
                        Case: <code>{{ ticketResult.caseId }}</code>
                    </p>
                    <button @click="resetTicket">Close</button>
                </div>
                <form v-else @submit.prevent="submitTicket">
                    <h3>Create a ticket</h3>
                    <label>Name<input v-model="ticketPrefill.name" type="text"/></label>
                    <label>Email<input v-model="ticketPrefill.email" type="email" required/></label>
                    <label>Subject<input v-model="ticketPrefill.subject" type="text" required/></label>
                    <label>Description<textarea v-model="ticketPrefill.description" rows="4" required/></label>
                    <div class="cw-ticket-actions">
                        <button type="button" @click="ticketOpen = false">Cancel</button>
                        <button type="submit" :disabled="ticketSubmitting">
                            {{ ticketSubmitting ? "Sending…" : "Submit" }}
                        </button>
                    </div>
                </form>
            </div>

            <footer class="cw-composer">
                <textarea
                    v-model="input"
                    class="cw-input"
                    :placeholder="placeholder"
                    rows="2"
                    @keydown.enter.exact.prevent="send"
                />
                <button class="cw-send" @click="send" :disabled="sending || !input.trim()">
                    Send
                </button>
            </footer>
        </template>
    </div>
</template>

<script>
// Minimal Markdown renderer — bold, code, links, line breaks. Keeps the
// bundle small. For production you may want markdown-it + DOMPurify.
function renderMarkdown(text) {
    if (!text) return ""
    let s = String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>")
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    s = s.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener">$1</a>'
    )
    s = s.replace(/\n/g, "<br/>")
    return s
}

export default { methods: { renderMarkdown } }
</script>

<style>
:host {
    all: initial;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    color: #1a1a1a;
    line-height: 1.5;
}

* { box-sizing: border-box; }

.cw-launcher {
    position: fixed;
    bottom: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--cw-primary);
    color: white;
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483646;
    transition: transform 0.15s ease;
}
.cw-launcher.bottom-right { right: 24px; }
.cw-launcher.bottom-left  { left: 24px; }
.cw-launcher:hover { transform: scale(1.06); }

.cw-panel {
    background: white;
    border-radius: 14px;
    box-shadow: 0 16px 60px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483647;
}
.cw-panel.popup {
    position: fixed;
    bottom: 24px;
    width: 380px;
    height: min(640px, calc(100vh - 48px));
}
.cw-panel.popup.bottom-right { right: 24px; }
.cw-panel.popup.bottom-left  { left: 24px; }
.cw-panel.inline {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 480px;
    border-radius: 8px;
}

@media (max-width: 480px) {
    .cw-panel.popup {
        width: calc(100vw - 16px);
        height: calc(100vh - 16px);
        bottom: 8px;
        left: 8px !important;
        right: 8px !important;
    }
}

.cw-header {
    padding: 14px 16px;
    background: var(--cw-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.cw-header-left { display: flex; align-items: center; gap: 10px; }
.cw-logo { width: 24px; height: 24px; object-fit: contain; background: white; border-radius: 4px; padding: 2px; }
.cw-title { font-weight: 600; font-size: 15px; }
.cw-close {
    background: transparent; border: none; color: white;
    font-size: 24px; line-height: 1; cursor: pointer;
    padding: 0 4px;
}

.cw-loading, .cw-error {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: #666;
}
.cw-error { color: #b00020; padding: 16px; text-align: center; }

.cw-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #fafafa;
}
.cw-msg { display: flex; flex-direction: column; max-width: 85%; }
.cw-msg.user { align-self: flex-end; align-items: flex-end; }
.cw-msg.assistant { align-self: flex-start; align-items: flex-start; }
.cw-msg-bubble {
    padding: 9px 13px;
    border-radius: 14px;
    word-wrap: break-word;
    overflow-wrap: anywhere;
}
.cw-msg.user .cw-msg-bubble {
    background: var(--cw-primary);
    color: white;
    border-bottom-right-radius: 4px;
}
.cw-msg.assistant .cw-msg-bubble {
    background: white;
    color: #1a1a1a;
    border: 1px solid #e5e5e5;
    border-bottom-left-radius: 4px;
}
.cw-msg-bubble a { color: inherit; text-decoration: underline; }
.cw-msg-bubble code { background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }

.cw-typing { display: flex; gap: 4px; }
.cw-typing span {
    width: 6px; height: 6px; border-radius: 50%; background: #888;
    animation: cw-bounce 1.2s infinite ease-in-out;
}
.cw-typing span:nth-child(2) { animation-delay: 0.15s; }
.cw-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes cw-bounce {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1); }
}

.cw-sources {
    margin-top: 6px;
    font-size: 12px;
    color: #555;
}
.cw-sources summary { cursor: pointer; user-select: none; }
.cw-sources ul { margin: 6px 0 0; padding-left: 18px; }
.cw-sources a { color: var(--cw-primary); }

.cw-composer {
    border-top: 1px solid #e5e5e5;
    padding: 10px;
    display: flex;
    gap: 8px;
    background: white;
}
.cw-input {
    flex: 1;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 8px 10px;
    font-family: inherit;
    font-size: 14px;
    resize: none;
    outline: none;
}
.cw-input:focus { border-color: var(--cw-primary); }
.cw-send {
    background: var(--cw-primary);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-weight: 600;
    cursor: pointer;
}
.cw-send:disabled { opacity: 0.5; cursor: not-allowed; }

.cw-ticket {
    position: absolute;
    inset: 0;
    background: rgba(255,255,255,0.97);
    padding: 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    z-index: 5;
}
.cw-ticket h3 { margin: 0 0 10px; }
.cw-ticket form { display: flex; flex-direction: column; gap: 8px; }
.cw-ticket label { display: flex; flex-direction: column; font-size: 12px; color: #555; gap: 3px; }
.cw-ticket input, .cw-ticket textarea {
    border: 1px solid #ccc; border-radius: 6px; padding: 7px 9px;
    font-family: inherit; font-size: 14px;
}
.cw-ticket-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.cw-ticket-actions button {
    border-radius: 6px; padding: 7px 14px; cursor: pointer;
    border: 1px solid #ccc; background: white;
}
.cw-ticket-actions button[type="submit"] {
    background: var(--cw-primary); color: white; border-color: var(--cw-primary);
}
.cw-ticket-result {
    text-align: center;
    color: #b00020;
}
.cw-ticket-result.ok { color: #176f3a; }
.cw-ticket-result button {
    margin-top: 10px;
    background: var(--cw-primary);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    cursor: pointer;
}
.cw-case code {
    background: rgba(0,0,0,0.06); padding: 2px 6px; border-radius: 3px;
}

.cw-rating {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 2px 0;
    border-top: 1px solid #efefef;
    margin-top: 4px;
}
.cw-rating-label { font-size: 12px; color: #888; }
.cw-rating-btn {
    background: none; border: 1px solid #e5e5e5; border-radius: 6px;
    padding: 3px 8px; font-size: 14px; cursor: pointer; line-height: 1;
    transition: background 0.15s, border-color 0.15s;
}
.cw-rating-btn:hover:not(:disabled) { background: #f5f5f5; border-color: #ccc; }
.cw-rating-btn.active { background: #f0fdf4; border-color: #22c55e; }
.cw-rating-btn.disabled { opacity: 0.5; cursor: default; }
.cw-rating-thanks { font-size: 12px; color: #22c55e; }
</style>
