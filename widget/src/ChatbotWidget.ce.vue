<script setup>
import { ref, computed, onMounted, nextTick, watch } from "vue"
import { createClient } from "./api.js"

const props = defineProps({
    tenant:    { type: String, required: true },
    apiBase:   { type: String, default: "" },
    position:  { type: String, default: "bottom-right" },
    mode:      { type: String, default: "popup" },
})

// ─── State ─────────────────────────────────────────────────────────────
const config = ref(null)
const configError = ref(null)
const loadingConfig = ref(true)

const isOpen = ref(props.mode === "inline")
const messages = ref([])
const input = ref("")
const sending = ref(false)
const currentLanguage = ref(null)
const showEmoji = ref(false)

const sessionId = ref(crypto.randomUUID?.() ?? `s_${Date.now()}`)
const scrollRef = ref(null)
const inputRef = ref(null)

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
        const browserLang = (navigator.language || "en").slice(0, 2).toLowerCase()
        currentLanguage.value = cfg.languages.includes(browserLang)
            ? browserLang : cfg.default_language
        const greeting = cfg.ui_strings?.[currentLanguage.value]?.greeting
        if (greeting) messages.value.push({ role: "assistant", content: greeting })
    } catch (err) {
        configError.value = err.message
    } finally {
        loadingConfig.value = false
    }
})

const strings = computed(() => (config.value?.ui_strings?.[currentLanguage.value]) || {})
const title = computed(() =>
    strings.value.title || config.value?.branding?.display_name || config.value?.name || "Chat"
)
const placeholder = computed(() => strings.value.placeholder || "Write a message…")
const primaryColor = computed(() => config.value?.branding?.primary_color || "#6c63ff")
const logoUrl = computed(() => config.value?.branding?.logo_url || "")

// ─── Actions ──────────────────────────────────────────────────────────
function openChat() {
    isOpen.value = true
    showEmoji.value = false
    nextTick(() => { scrollToBottom(); inputRef.value?.focus() })
}

function closeChat() {
    isOpen.value = false
    ticketOpen.value = false
    showEmoji.value = false
}

function scrollToBottom() {
    const el = scrollRef.value
    if (el) el.scrollTop = el.scrollHeight
}

function insertEmoji(emoji) {
    input.value += emoji
    showEmoji.value = false
    inputRef.value?.focus()
}

async function send() {
    const text = input.value.trim()
    if (!text || sending.value) return

    messages.value.push({ role: "user", content: text })
    input.value = ""
    sending.value = true
    showEmoji.value = false
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
            messages.value.push({ role: "assistant", content: blockMessage(resp.block_reason) })
        } else {
            messages.value.push({
                role: "assistant",
                content: resp.answer,
                sources: resp.sources?.length ? resp.sources : undefined,
            })
            const ticketAction = resp.actions?.find(
                a => a.result?.status === "form_required" && a.result?.prefill
            )
            if (ticketAction) {
                ticketPrefill.value = { ...ticketAction.result.prefill }
                ticketOpen.value = true
            }
        }
    } catch (err) {
        messages.value.push({ role: "assistant", content: `Something went wrong. (${err.message})` })
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
        const result = await client.value.submitTicket({ ...ticketPrefill.value, chatHistory })
        ticketResult.value = { ok: true, caseId: result.case_id, message: "Your ticket was submitted. We'll get back to you shortly." }
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

const EMOJIS = ["😊","😄","😂","🙂","🤩","😮","😟","😢","😱","🎉","🎊","❤️","✌️","👍","👎","🙏"]
</script>

<template>
    <!-- Launcher bubble -->
    <button
        v-if="props.mode === 'popup' && !isOpen"
        class="cw-launcher"
        :class="position"
        :style="{ '--cw-primary': primaryColor }"
        @click="openChat"
        aria-label="Open chat"
    >
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path d="M13 2C7.477 2 3 6.253 3 11.5c0 2.14.726 4.118 1.94 5.71L3 23l5.82-1.893A10.12 10.12 0 0013 21c5.523 0 10-4.253 10-9.5S18.523 2 13 2z" fill="white" fill-opacity=".95"/>
        </svg>
        <span class="cw-launcher-dot"></span>
    </button>

    <!-- Chat panel -->
    <div
        v-if="isOpen"
        class="cw-panel"
        :class="[position, mode]"
        :style="{ '--cw-primary': primaryColor }"
        role="dialog"
        aria-label="Chat window"
    >
        <!-- Header -->
        <header class="cw-header">
            <div class="cw-header-left">
                <div class="cw-avatar cw-avatar-lg" :style="{ '--cw-primary': primaryColor }">
                    <img v-if="logoUrl" :src="logoUrl" alt="" class="cw-avatar-img"/>
                    <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" fill="white"/>
                    </svg>
                </div>
                <div>
                    <div class="cw-header-title">{{ title }}</div>
                    <div class="cw-header-status">
                        <span class="cw-status-dot"></span>
                        Online
                    </div>
                </div>
            </div>
            <div class="cw-header-actions">
                <button v-if="props.mode === 'popup'" class="cw-icon-btn" @click="closeChat" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </header>

        <!-- Loading / error -->
        <div v-if="loadingConfig" class="cw-loading">
            <div class="cw-loading-dots"><span></span><span></span><span></span></div>
        </div>
        <div v-else-if="configError" class="cw-error">{{ configError }}</div>

        <template v-else>
            <!-- Messages -->
            <main class="cw-messages" ref="scrollRef" @click="showEmoji = false">
                <div
                    v-for="(m, i) in messages"
                    :key="i"
                    class="cw-msg-row"
                    :class="m.role"
                >
                    <div v-if="m.role === 'assistant'" class="cw-avatar cw-avatar-sm" :style="{ '--cw-primary': primaryColor }">
                        <img v-if="logoUrl" :src="logoUrl" alt="" class="cw-avatar-img"/>
                        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" fill="white"/>
                        </svg>
                    </div>
                    <div class="cw-msg-body">
                        <div class="cw-bubble" :class="m.role" v-html="renderMarkdown(m.content)"/>
                        <!-- Sources — collapsible toggle -->
                        <details v-if="m.sources" class="cw-sources">
                            <summary class="cw-sources-toggle">
                                <svg class="cw-sources-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                                {{ m.sources.length }} source{{ m.sources.length === 1 ? '' : 's' }}
                            </summary>
                            <div class="cw-sources-list">
                                <a
                                    v-for="(s, j) in m.sources"
                                    :key="j"
                                    class="cw-source-chip"
                                    :href="s.source_url || '#'"
                                    :target="s.source_url ? '_blank' : ''"
                                    rel="noopener"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    {{ s.title || `Source ${j + 1}` }}
                                </a>
                            </div>
                        </details>
                    </div>
                </div>

                <!-- Typing indicator -->
                <div v-if="sending" class="cw-msg-row assistant">
                    <div class="cw-avatar cw-avatar-sm" :style="{ '--cw-primary': primaryColor }">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" fill="white"/>
                        </svg>
                    </div>
                    <div class="cw-bubble assistant cw-typing">
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

            <!-- Ticket overlay -->
            <div v-if="ticketOpen" class="cw-ticket">
                <div v-if="ticketResult" class="cw-ticket-result" :class="{ ok: ticketResult.ok }">
                    <div class="cw-ticket-icon">{{ ticketResult.ok ? '✓' : '!' }}</div>
                    <p>{{ ticketResult.message }}</p>
                    <p v-if="ticketResult.caseId" class="cw-case-id">Case #{{ ticketResult.caseId }}</p>
                    <button class="cw-btn-primary" @click="resetTicket">Done</button>
                </div>
                <form v-else class="cw-ticket-form" @submit.prevent="submitTicket">
                    <div class="cw-ticket-header">
                        <h3>Create a support ticket</h3>
                        <button type="button" class="cw-icon-btn" @click="ticketOpen = false" aria-label="Close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    <div class="cw-field">
                        <label>Name</label>
                        <input v-model="ticketPrefill.name" type="text" placeholder="Your name"/>
                    </div>
                    <div class="cw-field">
                        <label>Email</label>
                        <input v-model="ticketPrefill.email" type="email" placeholder="you@example.com" required/>
                    </div>
                    <div class="cw-field">
                        <label>Subject</label>
                        <input v-model="ticketPrefill.subject" type="text" placeholder="Brief summary" required/>
                    </div>
                    <div class="cw-field">
                        <label>Description</label>
                        <textarea v-model="ticketPrefill.description" rows="3" placeholder="Describe the issue…" required/>
                    </div>
                    <div class="cw-ticket-actions">
                        <button type="button" class="cw-btn-ghost" @click="ticketOpen = false">Cancel</button>
                        <button type="submit" class="cw-btn-primary" :disabled="ticketSubmitting" :style="{ background: primaryColor }">
                            {{ ticketSubmitting ? "Sending…" : "Submit ticket" }}
                        </button>
                    </div>
                </form>
            </div>

            <!-- Emoji picker -->
            <div v-if="showEmoji" class="cw-emoji-picker">
                <button
                    v-for="e in EMOJIS"
                    :key="e"
                    class="cw-emoji-btn"
                    type="button"
                    @click="insertEmoji(e)"
                >{{ e }}</button>
            </div>

            <!-- Composer -->
            <footer class="cw-composer">
                <div class="cw-input-wrap">
                    <input
                        ref="inputRef"
                        v-model="input"
                        class="cw-input"
                        :placeholder="placeholder"
                        @keydown.enter.exact.prevent="send"
                        @keydown.esc="showEmoji = false"
                        autocomplete="off"
                    />
                    <button
                        type="button"
                        class="cw-emoji-toggle"
                        :class="{ active: showEmoji }"
                        @click.stop="showEmoji = !showEmoji"
                        aria-label="Emoji"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                        </svg>
                    </button>
                </div>
                <button
                    class="cw-send"
                    :style="{ background: primaryColor }"
                    @click="send"
                    :disabled="sending || !input.trim()"
                    aria-label="Send"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </footer>

            <!-- Powered by -->
            <div class="cw-powered">
                Powered by <strong>Botify</strong>
            </div>
        </template>
    </div>
</template>

<script>
function renderMarkdown(text) {
    if (!text) return ""
    let s = String(text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>")
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
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
    color: #111;
    line-height: 1.5;
}
* { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Launcher ───────────────────────────────────────────────── */
.cw-launcher {
    position: fixed;
    bottom: 24px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: none;
    background: var(--cw-primary);
    color: white;
    box-shadow: 0 8px 32px color-mix(in srgb, var(--cw-primary) 45%, transparent);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483646;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.cw-launcher.bottom-right { right: 24px; }
.cw-launcher.bottom-left  { left: 24px; }
.cw-launcher:hover { transform: scale(1.08); box-shadow: 0 12px 40px color-mix(in srgb, var(--cw-primary) 55%, transparent); }
.cw-launcher-dot {
    position: absolute;
    top: 4px; right: 4px;
    width: 12px; height: 12px;
    border-radius: 50%;
    background: #22c55e;
    border: 2px solid white;
}

/* ── Panel ──────────────────────────────────────────────────── */
.cw-panel {
    background: #fff;
    border-radius: 20px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483647;
    animation: cw-slide-up 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cw-panel.popup {
    position: fixed;
    bottom: 24px;
    width: 390px;
    height: min(660px, calc(100vh - 48px));
}
.cw-panel.popup.bottom-right { right: 24px; }
.cw-panel.popup.bottom-left  { left: 24px; }
.cw-panel.inline {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 480px;
    border-radius: 12px;
}
@keyframes cw-slide-up {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
}
@media (max-width: 480px) {
    .cw-panel.popup {
        width: calc(100vw - 12px);
        height: calc(100dvh - 12px);
        bottom: 6px; left: 6px !important; right: 6px !important;
        border-radius: 16px;
    }
}

/* ── Avatar ─────────────────────────────────────────────────── */
.cw-avatar {
    border-radius: 50%;
    background: linear-gradient(135deg, var(--cw-primary), color-mix(in srgb, var(--cw-primary) 60%, #000));
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--cw-primary) 35%, transparent);
}
.cw-avatar-lg { width: 42px; height: 42px; }
.cw-avatar-sm { width: 28px; height: 28px; align-self: flex-end; }
.cw-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

/* ── Header ─────────────────────────────────────────────────── */
.cw-header {
    padding: 14px 16px;
    background: #fff;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}
.cw-header-left { display: flex; align-items: center; gap: 12px; }
.cw-header-title { font-weight: 700; font-size: 15px; color: #111; }
.cw-header-status { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #888; margin-top: 1px; }
.cw-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; }
.cw-header-actions { display: flex; align-items: center; gap: 4px; }
.cw-icon-btn {
    background: none; border: none; cursor: pointer; color: #999;
    width: 32px; height: 32px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
}
.cw-icon-btn:hover { background: #f5f5f5; color: #333; }

/* ── Loading ────────────────────────────────────────────────── */
.cw-loading {
    flex: 1; display: flex; align-items: center; justify-content: center;
}
.cw-loading-dots { display: flex; gap: 6px; }
.cw-loading-dots span {
    width: 8px; height: 8px; border-radius: 50%; background: #ddd;
    animation: cw-bounce 1.2s infinite ease-in-out;
}
.cw-loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.cw-loading-dots span:nth-child(3) { animation-delay: 0.4s; }
.cw-error { flex: 1; display: flex; align-items: center; justify-content: center; color: #e53e3e; padding: 20px; text-align: center; font-size: 13px; }

/* ── Messages ───────────────────────────────────────────────── */
.cw-messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: #f7f7f8;
    scroll-behavior: smooth;
}
.cw-messages::-webkit-scrollbar { width: 4px; }
.cw-messages::-webkit-scrollbar-track { background: transparent; }
.cw-messages::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; }

.cw-msg-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    animation: cw-msg-in 0.2s ease;
}
.cw-msg-row.user { flex-direction: row-reverse; }
@keyframes cw-msg-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}

.cw-msg-body { display: flex; flex-direction: column; gap: 4px; max-width: 78%; }
.cw-msg-row.user .cw-msg-body { align-items: flex-end; }

.cw-bubble {
    padding: 10px 14px;
    border-radius: 18px;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.55;
}
.cw-bubble.assistant {
    background: #fff;
    color: #111;
    border-bottom-left-radius: 5px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.07);
}
.cw-bubble.user {
    background: var(--cw-primary);
    color: #fff;
    border-bottom-right-radius: 5px;
}
.cw-bubble a { color: inherit; text-decoration: underline; opacity: 0.85; }
.cw-bubble code { background: rgba(0,0,0,0.08); padding: 1px 5px; border-radius: 4px; font-size: 0.88em; font-family: monospace; }

/* Typing animation */
.cw-typing { display: flex; gap: 5px; padding: 13px 16px !important; }
.cw-typing span {
    width: 7px; height: 7px; border-radius: 50%; background: #bbb;
    animation: cw-bounce 1.2s infinite ease-in-out;
}
.cw-typing span:nth-child(2) { animation-delay: 0.15s; }
.cw-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes cw-bounce {
    0%, 80%, 100% { transform: scale(0.75); opacity: 0.4; }
    40%            { transform: scale(1);    opacity: 1; }
}

/* Source chips */
.cw-sources { margin-top: 6px; }
.cw-sources-toggle {
    display: flex; align-items: center; gap: 4px;
    list-style: none; cursor: pointer; user-select: none;
    font-size: 11px; color: #999;
    width: fit-content;
}
.cw-sources-toggle::-webkit-details-marker { display: none; }
.cw-sources-arrow { transition: transform 0.2s ease; flex-shrink: 0; }
details[open] .cw-sources-arrow { transform: rotate(90deg); }
.cw-sources-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.cw-source-chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 11px; color: #666;
    background: #fff; border: 1px solid #e4e4e4;
    border-radius: 20px; padding: 3px 9px;
    text-decoration: none; cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}
.cw-source-chip:hover { border-color: var(--cw-primary); color: var(--cw-primary); }

/* ── Ticket overlay ─────────────────────────────────────────── */
.cw-ticket {
    position: absolute; inset: 0;
    background: rgba(247,247,248,0.97);
    backdrop-filter: blur(4px);
    padding: 20px 18px;
    display: flex; flex-direction: column; justify-content: center;
    z-index: 5;
    animation: cw-slide-up 0.2s ease;
}
.cw-ticket-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
}
.cw-ticket-header h3 { font-size: 16px; font-weight: 700; }
.cw-ticket-form { display: flex; flex-direction: column; gap: 10px; }
.cw-field { display: flex; flex-direction: column; gap: 4px; }
.cw-field label { font-size: 12px; font-weight: 600; color: #555; }
.cw-field input, .cw-field textarea {
    border: 1.5px solid #e4e4e4; border-radius: 10px;
    padding: 8px 11px; font-family: inherit; font-size: 14px;
    outline: none; background: #fff; transition: border-color 0.15s;
}
.cw-field input:focus, .cw-field textarea:focus { border-color: var(--cw-primary); }
.cw-field textarea { resize: none; }
.cw-ticket-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }

.cw-ticket-result {
    text-align: center; color: #e53e3e;
    display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.cw-ticket-result.ok { color: #16a34a; }
.cw-ticket-icon {
    width: 48px; height: 48px; border-radius: 50%;
    background: currentColor; color: white;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; font-weight: 700;
    filter: brightness(1.2);
}
.cw-ticket-result.ok .cw-ticket-icon { background: #16a34a; }
.cw-ticket-result:not(.ok) .cw-ticket-icon { background: #e53e3e; }
.cw-case-id { font-size: 12px; font-family: monospace; color: #888; }

/* Shared buttons */
.cw-btn-primary {
    background: var(--cw-primary); color: white; border: none;
    border-radius: 10px; padding: 9px 18px; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
}
.cw-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.cw-btn-ghost {
    background: none; color: #666;
    border: 1.5px solid #e4e4e4; border-radius: 10px;
    padding: 9px 16px; font-size: 14px; cursor: pointer;
    transition: border-color 0.15s;
}
.cw-btn-ghost:hover { border-color: #bbb; }

/* ── Emoji picker ───────────────────────────────────────────── */
.cw-emoji-picker {
    position: absolute;
    bottom: 68px; right: 14px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 14px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.12);
    padding: 10px;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    z-index: 10;
    animation: cw-slide-up 0.15s ease;
}
.cw-emoji-btn {
    background: none; border: none; cursor: pointer;
    font-size: 20px; line-height: 1; padding: 5px;
    border-radius: 8px; transition: background 0.1s;
}
.cw-emoji-btn:hover { background: #f5f5f5; }

/* ── Composer ───────────────────────────────────────────────── */
.cw-composer {
    border-top: 1px solid #f0f0f0;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #fff;
}
.cw-input-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    background: #f4f4f5;
    border-radius: 24px;
    padding: 0 6px 0 14px;
    gap: 4px;
}
.cw-input {
    flex: 1;
    border: none;
    background: transparent;
    padding: 10px 0;
    font-family: inherit;
    font-size: 14px;
    outline: none;
    color: #111;
}
.cw-input::placeholder { color: #aaa; }
.cw-emoji-toggle {
    background: none; border: none; cursor: pointer; color: #aaa;
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
}
.cw-emoji-toggle:hover, .cw-emoji-toggle.active { color: var(--cw-primary); background: color-mix(in srgb, var(--cw-primary) 10%, transparent); }

.cw-send {
    width: 40px; height: 40px; border-radius: 50%;
    border: none; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: opacity 0.15s, transform 0.15s;
    box-shadow: 0 2px 8px color-mix(in srgb, var(--cw-primary) 35%, transparent);
}
.cw-send:hover:not(:disabled) { transform: scale(1.08); }
.cw-send:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Footer ─────────────────────────────────────────────────── */
.cw-powered {
    text-align: center;
    font-size: 11px;
    color: #bbb;
    padding: 5px 0 8px;
    background: #fff;
}
.cw-powered strong { color: #999; font-weight: 600; }

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
