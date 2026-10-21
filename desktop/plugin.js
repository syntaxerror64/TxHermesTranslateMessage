/**
 * Translate Guard — desktop half.
 *
 * ▾ chevron next to the send/voice cluster (COMPOSER_AREAS.actions) opens a
 * menu: autotranslate switch + target language (en default, zh). With
 * autotranslate on, COMPOSER_AREAS.middleware rewrites the outgoing draft via
 * the plugin's own backend (`/api/plugins/translate-guard/translate`, a
 * cascade of Google → Mozhi → SimplyTranslate → Lingva → MyMemory), so the
 * chat stores the TRANSLATED message. The original↔translated pair is kept in
 * plugin storage; an icon injected into the edit composer toggles between
 * them (the edit composer has no plugin slot, hence the DOM injection).
 *
 * Settings ▸ Plugins ▸ Translate Guard mirrors the switch/language and shows
 * live engine (circuit-breaker) health.
 */
import {
  COMPOSER_AREAS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tip,
  host,
  usePluginI18n
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState, useSyncExternalStore } from 'react'

const ID = 'translate-guard'

const LANGS = [
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Shqip' },
  { code: 'am', label: 'አማርኛ' },
  { code: 'ar', label: 'العربية' },
  { code: 'hy', label: 'Հայերեն' },
  { code: 'az', label: 'Azərbaycan' },
  { code: 'eu', label: 'Euskara' },
  { code: 'be', label: 'Беларуская' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'bs', label: 'Bosanski' },
  { code: 'bg', label: 'Български' },
  { code: 'ca', label: 'Català' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'zh', label: '中文' },
  { code: 'co', label: 'Corsu' },
  { code: 'hr', label: 'Hrvatski' },
  { code: 'cs', label: 'Čeština' },
  { code: 'da', label: 'Dansk' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'en', label: 'English' },
  { code: 'eo', label: 'Esperanto' },
  { code: 'et', label: 'Eesti' },
  { code: 'fa', label: 'فارسی' },
  { code: 'fi', label: 'Suomi' },
  { code: 'fr', label: 'Français' },
  { code: 'fy', label: 'Frysk' },
  { code: 'gl', label: 'Galego' },
  { code: 'ka', label: 'ქართული' },
  { code: 'de', label: 'Deutsch' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'ht', label: 'Kreyòl ayisyen' },
  { code: 'ha', label: 'Hausa' },
  { code: 'haw', label: 'ʻŌlelo Hawaiʻi' },
  { code: 'he', label: 'עברית' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'hmn', label: 'Hmoob' },
  { code: 'hu', label: 'Magyar' },
  { code: 'is', label: 'Íslenska' },
  { code: 'ig', label: 'Igbo' },
  { code: 'id', label: 'Indonesia' },
  { code: 'ga', label: 'Gaeilge' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
  { code: 'jv', label: 'Jawa' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'kk', label: 'Қазақ' },
  { code: 'km', label: 'ខ្មែរ' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'ko', label: '한국어' },
  { code: 'ku', label: 'Kurdî' },
  { code: 'ky', label: 'Кыргызча' },
  { code: 'lo', label: 'ລາວ' },
  { code: 'la', label: 'Latina' },
  { code: 'lv', label: 'Latviešu' },
  { code: 'lt', label: 'Lietuvių' },
  { code: 'lb', label: 'Lëtzebuergesch' },
  { code: 'mk', label: 'Македонски' },
  { code: 'mg', label: 'Malagasy' },
  { code: 'ms', label: 'Melayu' },
  { code: 'ml', label: 'മലയാളം' },
  { code: 'mt', label: 'Malti' },
  { code: 'mi', label: 'Māori' },
  { code: 'mr', label: 'मराठी' },
  { code: 'mn', label: 'Монгол' },
  { code: 'my', label: 'မြန်မာ' },
  { code: 'ne', label: 'नेपाली' },
  { code: 'no', label: 'Norsk' },
  { code: 'ny', label: 'Chichewa' },
  { code: 'or', label: 'ଓଡ଼ିଆ' },
  { code: 'ps', label: 'پښتو' },
  { code: 'pl', label: 'Polski' },
  { code: 'pt', label: 'Português' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ' },
  { code: 'ro', label: 'Română' },
  { code: 'ru', label: 'Русский' },
  { code: 'sm', label: 'Samoa' },
  { code: 'gd', label: 'Gàidhlig' },
  { code: 'sr', label: 'Српски' },
  { code: 'st', label: 'Sesotho' },
  { code: 'sn', label: 'Shona' },
  { code: 'sd', label: 'سنڌي' },
  { code: 'si', label: 'සිංහල' },
  { code: 'sk', label: 'Slovenčina' },
  { code: 'sl', label: 'Slovenščina' },
  { code: 'so', label: 'Soomaali' },
  { code: 'es', label: 'Español' },
  { code: 'su', label: 'Sunda' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'sv', label: 'Svenska' },
  { code: 'tl', label: 'Filipino' },
  { code: 'tg', label: 'Тоҷикӣ' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'tt', label: 'Татарча' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'th', label: 'ไทย' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'tk', label: 'Türkmen' },
  { code: 'uk', label: 'Українська' },
  { code: 'ur', label: 'اردو' },
  { code: 'ug', label: 'ئۇيغۇرچە' },
  { code: 'uz', label: 'Oʻzbek' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'cy', label: 'Cymraeg' },
  { code: 'xh', label: 'isiXhosa' },
  { code: 'yi', label: 'ייִדיש' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'zu', label: 'isiZulu' }
]

// The classic Google-Translate glyph (文 + A) — recognizable, no asset needed.
const TRANSLATE_GLYPH =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">' +
  '<path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>' +
  '</svg>'

const CHEVRON_GLYPH =
  '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor" aria-hidden="true">' +
  '<path d="M4.5 6.5 8 10l3.5-3.5.9.9L8 11.8 3.6 7.4z"/></svg>'

// --------------------------------------------------------------------------- //
// Shared state (settings + a tiny pub/sub so the menu and the settings page
// stay in sync across surfaces)
// --------------------------------------------------------------------------- //

let ctx = null
const listeners = new Set()
let settings = { enabled: true, to: 'en' }

function emit() {
  listeners.forEach(listener => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function useSettings() {
  return useSyncExternalStore(
    subscribe,
    () => settings,
    () => settings
  )
}

function saveSettings(patch) {
  settings = { ...settings, ...patch }
  ctx.storage.set('local.settings', settings)
  emit()
}

const PAIRS_KEY = 'local.pairs'
const PAIRS_MAX = 100

/** Remember translated → original so the edit-composer toggle can go back. */
function rememberPair(translated, original) {
  const pairs = ctx.storage.get(PAIRS_KEY, {})
  pairs[translated] = original
  const keys = Object.keys(pairs)
  if (keys.length > PAIRS_MAX) {
    for (const key of keys.slice(0, keys.length - PAIRS_MAX)) delete pairs[key]
  }
  ctx.storage.set(PAIRS_KEY, pairs)
}

// --------------------------------------------------------------------------- //
// Composer menu (▾) — autotranslate switch + language
// --------------------------------------------------------------------------- //

function TranslateMenu() {
  const t = usePluginI18n(ID)
  const current = useSettings()

  return jsxs(DropdownMenu, {
    children: [
      jsx(DropdownMenuTrigger, {
        asChild: true,
        children: jsx('button', {
          type: 'button',
          title: t('menuTip'),
          'aria-label': t('menuTip'),
          className:
            'inline-flex h-6 items-center gap-0.5 rounded-md px-1 text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
          // The actions slot renders BEFORE the controls row; order lifts us after the send cluster.
          style: { order: 1 },
          children: [
            jsx('span', {
              dangerouslySetInnerHTML: { __html: TRANSLATE_GLYPH },
              style: { display: 'inline-flex' }
            }),
            jsx('span', {
              dangerouslySetInnerHTML: { __html: CHEVRON_GLYPH },
              style: { display: 'inline-flex', opacity: 0.7 }
            })
          ]
        })
      }),
      jsx(DropdownMenuContent, {
        align: 'start',
        children: [
          jsx('div', {
            className: 'flex items-center justify-between gap-3 px-2 py-1.5',
            onClick: event => event.preventDefault(), // don't close the menu
            children: [
              jsx('span', { className: 'text-xs', children: t('autoTranslate') }),
              jsx(Switch, {
                checked: current.enabled,
                onCheckedChange: value => saveSettings({ enabled: value })
              })
            ]
          }),
          jsx(DropdownMenuSeparator, {}),
          ...LANGS.map(lang =>
            jsx(
              DropdownMenuItem,
              {
                onSelect: () => saveSettings({ to: lang.code }),
                children: jsxs('span', {
                  className: 'flex w-full items-center justify-between',
                  children: [
                    jsx('span', { children: lang.label }),
                    current.to === lang.code &&
                      jsx('span', { className: 'opacity-70', children: '✓' })
                  ]
                })
              },
              lang.code
            )
          )
        ]
      })
    ]
  })
}

// --------------------------------------------------------------------------- //
// Middleware — rewrite the outgoing draft through the translation cascade
// --------------------------------------------------------------------------- //

async function translateDraft(draft) {
  const text = (draft.text || '').trim()
  if (!settings.enabled || !text) return draft
  try {
    const result = await ctx.rest('/translate', {
      method: 'POST',
      body: { text: draft.text, to: settings.to },
      timeoutMs: 35000
    })
    if (result?.text && result.text !== draft.text) {
      rememberPair(result.text, draft.text)
      return { ...draft, text: result.text }
    }
  } catch (error) {
    // Fail-open: never eat the user's message — send it untranslated.
    // Surfaced in the desktop log: the toast alone is easy to miss.
    console.warn('[translate-guard] translate REST failed:', String(error?.message || error))
    host.notify({
      kind: 'warning',
      message: `Перевод недоступен — сообщение отправлено без перевода (${String(error?.message || error)})`
    })
  }
  return draft
}

// --------------------------------------------------------------------------- //
// Edit-composer toggle — DOM injection (the edit composer exposes no slot).
// Injected next to its send button; click swaps the editor text between the
// stored original and the translated text that was actually sent.
// --------------------------------------------------------------------------- //

const BTN_ATTR = 'data-tg-translate-btn'

function setEditorText(editor, text) {
  editor.replaceChildren(document.createTextNode(text))
  editor.dispatchEvent(new InputEvent('input', { bubbles: true }))
}

function toggleOriginal(root) {
  const editor = root.querySelector('.ui-prompt-input__container div[contenteditable="true"]')
  if (!editor) return
  const current = editor.textContent || ''
  const pairs = ctx.storage.get(PAIRS_KEY, {})
  if (Object.prototype.hasOwnProperty.call(pairs, current)) {
    setEditorText(editor, pairs[current]) // translated → original
    return
  }
  const translated = Object.keys(pairs).find(key => pairs[key] === current)
  if (translated) {
    setEditorText(editor, translated) // original → translated
    return
  }
  host.notify({ kind: 'info', message: 'Для этого сообщения нет сохранённого перевода' })
}

function injectEditToggles() {
  document.querySelectorAll('[data-slot="aui_edit-composer-root"]').forEach(root => {
    if (root.querySelector(`[${BTN_ATTR}]`)) return
    const container = root.querySelector('.ui-prompt-input__container')
    // The send button owns `absolute right-2 bottom-2`; ours sits 24px left of it.
    const send = container && container.querySelector('button[class*="right-2"]')
    if (!container || !send) return

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(BTN_ATTR, '')
    button.title = 'Показать оригинал / перевод'
    button.setAttribute('aria-label', 'Показать оригинал / перевод')
    button.innerHTML = TRANSLATE_GLYPH
    button.style.cssText =
      'position:absolute;right:32px;bottom:8px;width:20px;height:20px;' +
      'display:inline-flex;align-items:center;justify-content:center;' +
      'border:0;padding:0;background:transparent;cursor:pointer;' +
      'color:var(--ui-text-tertiary);border-radius:4px'
    button.addEventListener('pointerdown', event => event.preventDefault()) // keep the edit alive (same guard as the send button)
    button.addEventListener('click', () => toggleOriginal(root))
    container.appendChild(button)
  })
}

function startEditToggle() {
  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      try {
        injectEditToggles()
      } catch {
        /* the edit composer may be tearing down — retry on the next mutation */
      }
    })
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  schedule()
  return () => {
    observer.disconnect()
    document.querySelectorAll(`[${BTN_ATTR}]`).forEach(node => node.remove())
  }
}

// --------------------------------------------------------------------------- //
// Settings page (Settings ▸ Plugins ▸ Translate Guard)
// --------------------------------------------------------------------------- //

function SettingsPage() {
  const t = usePluginI18n(ID)
  const current = useSettings()
  const [engines, setEngines] = useState(null)
  const [error, setError] = useState(null)
  const [cacheState, setCacheState] = useState(null)

  const clearCache = () => {
    setCacheState(null)
    ctx
      .rest('/cache/clear', { method: 'POST' })
      .then(res => setCacheState({ text: `${t('cacheCleared')}: ${res?.cleared ?? 0}` }))
      .catch(err =>
        setCacheState({ error: true, text: `${t('cacheClearFailed')}: ${String(err?.message || err)}` })
      )
  }

  const refresh = () => {
    setError(null)
    ctx
      .rest('/engines')
      .then(data => setEngines(data || {}))
      .catch(err => setError(String(err?.message || err)))
  }

  useEffect(refresh, [])

  return jsxs('div', {
    className: 'flex max-w-xl flex-col gap-4 p-1 text-sm',
    children: [
      jsx('div', {
        className: 'flex items-center justify-between gap-3',
        children: [
          jsx('div', {
            children: [
              jsx('div', { className: 'font-medium', children: t('autoTranslate') }),
              jsx('div', {
                className: 'text-xs text-(--ui-text-tertiary)',
                children: t('autoTranslateHint')
              })
            ]
          }),
          jsx(Switch, {
            checked: current.enabled,
            onCheckedChange: value => saveSettings({ enabled: value })
          })
        ]
      }),
      jsx('div', {
        className: 'flex items-center justify-between gap-3',
        children: [
          jsx('div', {
            children: [
              jsx('div', { className: 'font-medium', children: t('language') }),
              jsx('div', {
                className: 'text-xs text-(--ui-text-tertiary)',
                children: t('languageHint')
              })
            ]
          }),
          jsx(Select, {
            value: current.to,
            onValueChange: value => saveSettings({ to: value }),
            children: [
              jsx(SelectTrigger, {
                className: 'w-40',
                children: jsx(SelectValue, {})
              }),
              jsx(SelectContent, {
                children: LANGS.map(lang =>
                  jsx(
                    SelectItem,
                    { value: lang.code, children: lang.label },
                    lang.code
                  )
                )
              })
            ]
          })
        ]
      }),
      jsxs('div', {
        className: 'flex flex-col gap-1.5',
        children: [
          jsxs('div', {
            className: 'flex items-center justify-between',
            children: [
              jsx('div', { className: 'font-medium', children: t('engines') }),
              jsx('button', {
                type: 'button',
                className:
                  'rounded-md px-2 py-0.5 text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)',
                onClick: refresh,
                children: t('refresh')
              })
            ]
          }),
          jsx('div', {
            className: 'text-xs text-(--ui-text-tertiary)',
            children: t('enginesHint')
          }),
          error &&
            jsx('div', { className: 'text-xs text-red-500', children: `${t('enginesError')}: ${error}` }),
          engines &&
            jsxs('div', {
              className: 'flex flex-col gap-1',
              children: [
                ...Object.entries(engines).map(([name, info]) =>
                  jsxs(
                    'div',
                    {
                      className: 'flex items-center justify-between rounded-md border border-(--ui-stroke-secondary) px-2 py-1',
                      children: [
                        jsx('span', { children: name }),
                        jsxs('span', {
                          className:
                            info.state === 'open'
                              ? 'text-xs text-amber-500'
                              : 'text-xs text-emerald-500',
                          children: [
                            info.state === 'open' ? t('engineOpen') : t('engineClosed'),
                            info.failures ? ` (${info.failures})` : ''
                          ]
                        })
                      ]
                    },
                    name
                  )
                ),
                !Object.keys(engines).length &&
                  jsx('div', {
                    className: 'text-xs text-(--ui-text-tertiary)',
                    children: t('enginesEmpty')
                  })
              ]
            })
        ]
      }),
      jsxs('div', {
        className: 'flex flex-col gap-1.5',
        children: [
          jsx('div', { className: 'font-medium', children: t('cache') }),
          jsx('div', {
            className: 'text-xs text-(--ui-text-tertiary)',
            children: t('cacheHint')
          }),
          jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              jsx('button', {
                type: 'button',
                className:
                  'rounded-md border border-(--ui-stroke-secondary) px-2 py-1 text-xs hover:bg-(--chrome-action-hover)',
                onClick: clearCache,
                children: t('clearCache')
              }),
              cacheState &&
                jsx('span', {
                  className: cacheState.error ? 'text-xs text-red-500' : 'text-xs text-emerald-500',
                  children: cacheState.text
                })
            ]
          })
        ]
      })
    ]
  })
}

// --------------------------------------------------------------------------- //

export default {
  id: ID,
  name: 'Translate Guard',
  register(pluginCtx) {
    ctx = pluginCtx
    settings = ctx.storage.get('local.settings', { enabled: true, to: 'en' })

    ctx.i18n.register({
      en: {
        menuTip: 'Translation settings',
        autoTranslate: 'Auto-translate outgoing messages',
        autoTranslateHint: 'Your message is translated before sending; the chat shows the translation.',
        language: 'Translate to',
        languageHint: 'Where your Russian messages are translated.',
        engines: 'Translation engines',
        enginesHint: 'Cascade: Google → Mozhi → SimplyTranslate → Lingva → MyMemory. A closed breaker means the engine recently failed and is being skipped.',
        engineOpen: 'failing',
        engineClosed: 'ok',
        enginesError: 'Cannot reach the backend',
        enginesEmpty: 'No engine data yet',
        refresh: 'Refresh',
        cache: 'Translation cache',
        cacheHint: 'Successful translations are cached for 7 days; clearing makes the next send ask the engines again.',
        clearCache: 'Clear cache',
        cacheCleared: 'Cache cleared',
        cacheClearFailed: 'Could not clear the cache'
      },
      ru: {
        menuTip: 'Настройки перевода',
        autoTranslate: 'Автоперевод исходящих сообщений',
        autoTranslateHint: 'Сообщение переводится перед отправкой; в чате показывается перевод.',
        language: 'Переводить на',
        languageHint: 'Язык, на который переводятся ваши русские сообщения.',
        engines: 'Движки перевода',
        enginesHint: 'Каскад: Google → Mozhi → SimplyTranslate → Lingva → MyMemory. «Проблема» — движок недавно отвалился и пока пропускается.',
        engineOpen: 'проблема',
        engineClosed: 'ок',
        enginesError: 'Бэкенд недоступен',
        enginesEmpty: 'Данных по движкам пока нет',
        refresh: 'Обновить',
        cache: 'Кэш переводов',
        cacheHint: 'Удачные переводы кэшируются на 7 дней; после очистки следующий запрос снова спросит движки.',
        clearCache: 'Очистить кэш',
        cacheCleared: 'Кэш очищен',
        cacheClearFailed: 'Не удалось очистить кэш'
      },
      zh: {
        menuTip: '翻译设置',
        autoTranslate: '自动翻译发送的消息',
        autoTranslateHint: '消息在发送前会先翻译；对话中显示的是译文。',
        language: '翻译为',
        languageHint: '你的俄语消息会被翻译成的语言。',
        engines: '翻译引擎',
        enginesHint: '级联顺序：Google → Mozhi → SimplyTranslate → Lingva → MyMemory。某项显示「异常」表示该引擎最近失败，暂时被跳过。',
        engineOpen: '异常',
        engineClosed: '正常',
        enginesError: '无法连接后端',
        enginesEmpty: '暂无引擎数据',
        refresh: '刷新',
        cache: '翻译缓存',
        cacheHint: '成功的翻译会缓存 7 天；清除后下一次发送会重新请求引擎。',
        clearCache: '清除缓存',
        cacheCleared: '缓存已清除',
        cacheClearFailed: '清除缓存失败'
      }
    })

    ctx.register({
      id: 'menu',
      area: COMPOSER_AREAS.actions,
      order: 50,
      render: () => jsx(TranslateMenu, {})
    })

    ctx.register({
      id: 'middleware',
      area: COMPOSER_AREAS.middleware,
      data: { handler: translateDraft }
    })

    ctx.registerSettingsPage?.({
      id: 'main',
      title: 'Translate Guard',
      icon: 'globe',
      render: () => jsx(SettingsPage, {})
    })

    ctx.onDispose(startEditToggle())
  }
}
