window.__ModuleLoader__.load({
  id: 'dsh-turn-auto-retry',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')

    /** Dictionary namespace owned by this plugin. */
    const NS = 'settings.turnAutoRetry'

    /** Host plugin entry id; also the settings namespace this page edits. */
    const ENTRY_ID = 'turn-auto-retry'

    const en = {
      title: 'Turn auto-retry',
      description: 'Retry a failed model request, tell the model why it failed and how the called tool must be called, and stop only after the same failure repeats past the limit.',
      maxRetries: 'Retries per identical failure',
      maxRetriesHint: 'How many times one identical failure message may be retried before the turn really stops. 0 turns the plugin off.',
      delayMs: 'Delay before each retry',
      delayMsHint: 'Milliseconds to wait before re-running the failed step.',
      increase: 'Increase',
      decrease: 'Decrease',
      unit: 'times',
      overridden: 'Overridden',
      reset: 'Reset to default',
      readOnly: 'This deployment stores settings read-only.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      invalidNumber: 'Enter a whole number, or leave blank to use the default.'
    }

    const zh = {
      title: '失败自动重试',
      description: '模型请求失败时自动重试，并把失败原因和被调用工具的正确参数告诉模型；只有同一条失败重复超过上限才真正停止本轮。',
      maxRetries: '同一失败的允许重试次数',
      maxRetriesHint: '同一条失败信息最多自动重试多少次，超过后本轮才真正结束。填 0 关闭本插件。',
      delayMs: '每次重试前的等待',
      delayMsHint: '重新执行失败步骤前等待的毫秒数。',
      increase: '增加',
      decrease: '减少',
      unit: '次',
      overridden: '已覆盖',
      reset: '恢复默认',
      readOnly: '本部署的设置为只读。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      invalidNumber: '请填整数；留空表示使用默认值。'
    }

    /** The form frame's copy, read from this page's dictionary. */
    function formLabels(t) {
      return {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving')
      }
    }

    /** One whole-number field spec that also enforces a floor. */
    function wholeNumberField(field, minimum) {
      const numeric = primitives.settingsNumberField(field)
      return {
        ...numeric,
        parse: (text) => {
          const write = numeric.parse(text)
          if (write?.kind !== 'set') return write
          const value = write.value
          return Number.isSafeInteger(value) && value >= minimum ? write : undefined
        }
      }
    }

    /** Render the page's one-liner or its settings form. */
    function TurnAutoRetryCard(props) {
      const { t } = props
      const state = props.useTurnAutoRetryCard((snapshot) => snapshot)
      if (props.view === 'summary') return t('description')
      const field = (name, id, label, hint) => h(primitives.SettingsValueField, {
        id,
        label,
        hint,
        overriddenLabel: t('overridden'),
        resetLabel: t('reset'),
        invalidLabel: t('invalidNumber'),
        numeric: true,
        disabled: !state.writable,
        ...state[name],
        onEdit: (text) => props.edit(name, text),
        onReset: () => props.resetField(name)
      })
      return h(primitives.SettingsForm, {
        labels: formLabels(t),
        state,
        onSave: props.save,
        onDiscard: props.discard
      },
        field('maxRetries', 'plugin-config-turn-auto-retry-max', t('maxRetries'), t('maxRetriesHint')),
        field('delayMs', 'plugin-config-turn-auto-retry-delay', t('delayMs'), t('delayMsHint'))
      )
    }

    /** One General-settings row, built like the font-size row. */
    function TurnAutoRetryRow(props) {
      const t = props.t ?? ((key) => key)
      const state = props.useTurnAutoRetryCard((snapshot) => snapshot) ?? {}
      const parsed = Number(state.maxRetries?.text ?? '')
      const value = Number.isSafeInteger(parsed) ? parsed : 3
      const busy = !state.writable || state.saving === true
      const step = (delta) => {
        const next = Math.min(20, Math.max(0, value + delta))
        if (next === value) return
        props.edit('maxRetries', String(next))
        props.save()
      }
      const arrow = (label, disabled, delta, icon) => h('button', {
        type: 'button',
        className: 'tar-arrow',
        'aria-label': label,
        disabled,
        onClick: () => step(delta)
      }, h(icon, { size: 9 }))
      return h('div', { className: 'tar-row' },
        h('div', { className: 'tar-rowText' },
          h('div', { className: 'tar-title' }, t('maxRetries')),
          h('div', { className: 'tar-desc' }, t('maxRetriesHint'))
        ),
        h('div', { className: 'tar-control' },
          h('div', { className: 'tar-stepper' },
            h('span', { className: 'tar-value' }, String(value)),
            h('span', { className: 'tar-arrows' },
              arrow(t('increase'), busy || value >= 20, 1, primitives.IconChevronUpOutlineRegular),
              arrow(t('decrease'), busy || value <= 0, -1, primitives.IconChevronDownOutlineRegular)
            )
          ),
          h('span', { className: 'tar-unit' }, t('unit'))
        )
      )
    }

    /** The page's staged form over this plugin's own settings namespace. */
    class TurnAutoRetryCardController {
      constructor(scope) {
        this.form = new primitives.SettingsFormModel(scope, [
          wholeNumberField('maxRetries', 0),
          wholeNumberField('delayMs', 0)
        ])
        this.store = this.form.bind(() => ({
          ...this.form.shell(),
          maxRetries: this.form.field('maxRetries'),
          delayMs: this.form.field('delayMs')
        }))
      }

      inject() {
        return {
          hooks: { turnAutoRetryCard: this.store },
          ...this.form.actions()
        }
      }

      dispose() {
        this.form.dispose()
      }
    }

    const inject = ['slots', 'locale', 'configForms']

    /** Row styles, matching the General section's font-size row. */
    const ROW_CSS = [
      '.tar-row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}',
      '.tar-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}',
      '.tar-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}',
      '.tar-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}',
      '.tar-control{align-items:center;gap:8px;display:inline-flex}'
    ].join('')

    const ROW_CSS_2 = [
      '.tar-stepper{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);justify-content:center;align-items:center;min-width:72px;height:36px;display:inline-flex;position:relative}',
      '.tar-value{text-align:center;font-variant-numeric:tabular-nums;min-width:18px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
      '.tar-unit{color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}',
      '.tar-arrows{opacity:0;flex-direction:column;gap:2px;display:flex;position:absolute;right:8px}',
      '@media (hover:hover){.tar-stepper:hover .tar-arrows{opacity:1}}',
      '.tar-stepper:focus-within .tar-arrows{opacity:1}',
      '@media (hover:none){.tar-arrows{opacity:1}}'
    ].join('')

    const ROW_CSS_3 = [
      '.tar-arrow{border-radius:var(--dsw-radius-xs);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 75%, transparent);width:17px;height:12px;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;justify-content:center;align-items:center;padding:0;display:inline-flex}',
      '@media (hover:hover){.tar-arrow:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}}',
      '.tar-arrow:disabled{color:var(--dsw-alias-label-caption);cursor:default}'
    ].join('')

    /** Mount the page and the General row while the namespace is served. */
    function apply(ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-turn-auto-retry'
        tag.dataset.pluginCss = 'dsh-turn-auto-retry/row.css'
        tag.textContent = ROW_CSS + ROW_CSS_2 + ROW_CSS_3
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'turn-auto-retry: row styles')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-auto-retry: dictionaries')
      const t = ctx.locale.bind(NS)
      const card = new TurnAutoRetryCardController(ctx.configForms.get(ENTRY_ID))
      ctx.effect(() => () => {
        card.dispose()
      }, 'turn-auto-retry: form subscription')
      ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => {
        const offPage = ctx.slots.inject('plugins.item', () => ctx.slots.register({
          name: 'plugins.item',
          id: ENTRY_ID,
          order: 50,
          label: () => t('title'),
          locale: NS,
          inject: () => card.inject()
        }, TurnAutoRetryCard))
        const offRow = ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: ENTRY_ID,
          order: 25,
          locale: NS,
          inject: () => card.inject()
        }, TurnAutoRetryRow))
        return () => {
          offRow()
          offPage()
        }
      }), 'turn-auto-retry: page and general row')
    }

    return { inject, apply }
  }
})
