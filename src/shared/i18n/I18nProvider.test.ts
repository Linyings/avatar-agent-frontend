import { describe, expect, it } from 'vitest'
import { dictionary } from './dictionary'
import { locales } from './locales'
import { resolveInitialLocale, translateText } from './I18nProvider'

describe('i18n translations', () => {
  it('uses an embedded initial locale only when no valid saved locale exists', () => {
    localStorage.removeItem('narratoai-locale')
    expect(resolveInitialLocale('zh-CN')).toBe('zh-CN')

    localStorage.setItem('narratoai-locale', 'de')
    expect(resolveInitialLocale('zh-CN')).toBe('de')

    localStorage.setItem('narratoai-locale', 'invalid')
    expect(resolveInitialLocale('zh-CN')).toBe('zh-CN')

    localStorage.removeItem('narratoai-locale')
    expect(resolveInitialLocale()).toBe('zh-CN')
  })

  it('uses a valid authorization locale query parameter before a saved browser locale', () => {
    localStorage.setItem('narratoai-locale', 'en')
    window.history.replaceState({}, '', '/desktop/authorize?locale=zh-CN')

    expect(resolveInitialLocale()).toBe('zh-CN')
  })

  it('keeps the saved browser locale when the URL has no locale parameter', () => {
    localStorage.setItem('narratoai-locale', 'en')
    window.history.replaceState({}, '', '/login')

    expect(resolveInitialLocale()).toBe('en')
  })

  it('translates every PC-owned Chinese source string', () => {
    const sources = [
      '\u767b\u5f55 NarratoAI \u684c\u9762\u7aef', '\u7ee7\u7eed\u5728\u6d4f\u89c8\u5668\u4e2d\u767b\u5f55', '\u5728\u6d4f\u89c8\u5668\u4e2d\u5b8c\u6210\u5b89\u5168\u767b\u5f55\uff0c\u5e94\u7528\u4e0d\u4f1a\u63a5\u6536\u4f60\u7684\u5bc6\u7801\u3002', '\u65b0\u5efa\u526a\u8f91\u4efb\u52a1', '\u8f93\u51fa\u8bed\u8a00', '\u4efb\u52a1\u961f\u5217', '\u672c\u5730\u4f5c\u54c1', '\u9009\u62e9\u89c6\u9891\u6587\u4ef6', '\u9009\u62e9\u8f93\u51fa\u76ee\u5f55', '\u52a0\u5165\u4efb\u52a1\u961f\u5217', '\u6682\u65e0\u672c\u5730\u4efb\u52a1', '\u6682\u65e0\u672c\u5730\u4f5c\u54c1', '\u8f93\u51fa\u6587\u4ef6\u4e0d\u53ef\u7528',
      '\u8bf7\u5728\u6d4f\u89c8\u5668\u4e2d\u5b8c\u6210\u767b\u5f55\uff0cNarratoAI \u684c\u9762\u7aef\u4f1a\u81ea\u52a8\u8fd4\u56de\u3002', '\u684c\u9762\u7aef\u767b\u5f55\u672a\u5b8c\u6210\uff0c\u8bf7\u91cd\u8bd5\u3002', '\u65e0\u6cd5\u542f\u52a8\u6d4f\u89c8\u5668\u767b\u5f55\u3002', '\u9009\u62e9\u591a\u4e2a\u672c\u5730\u89c6\u9891\u540e\uff0cPC \u7aef\u4f1a\u4e3a\u6bcf\u4e2a\u6587\u4ef6\u521b\u5efa\u4e00\u4e2a\u72ec\u7acb\u7684\u672c\u5730\u961f\u5217\u4efb\u52a1\u3002', '\u672c\u5730\u4fdd\u5b58', '\u5df2\u52a0\u5165\u672c\u5730\u526a\u8f91\u4efb\u52a1', '\u89c6\u9891\u6587\u4ef6', '\u8fd8\u6ca1\u6709\u9009\u62e9\u89c6\u9891\u6587\u4ef6\u3002', '\u5408\u8ba1\u5927\u5c0f\uff1a', '\u526a\u8f91\u53c2\u6570', '\u6267\u884c\u6a21\u5f0f', '\u771f\u5b9e\u526a\u8f91', '\u6a21\u62df\u6267\u884c', '\u89e3\u8bf4\u98ce\u683c', '\u914d\u97f3\u97f3\u8272', '\u6587\u6848\u5b57\u6570', '\u80cc\u666f\u97f3\u4e50', '\u65e0\u80cc\u666f\u97f3\u4e50', '\u9ed8\u8ba4\u80cc\u666f\u97f3\u4e50', '\u8f93\u51fa\u76ee\u5f55', '\u672a\u9009\u62e9\u65f6\uff0c\u540e\u7eed\u5bfc\u51fa\u524d\u518d\u9009\u62e9\u672c\u5730\u4fdd\u5b58\u4f4d\u7f6e\u3002', '\u6b63\u5728\u52a0\u8f7d\u53ef\u7528\u97f3\u8272\u2026', '\u6ca1\u6709\u4e0e\u6240\u9009\u8f93\u51fa\u8bed\u8a00\u517c\u5bb9\u7684\u97f3\u8272\u3002', '\u97f3\u8272\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002', '\u5168\u90e8\u6682\u505c', '\u5168\u90e8\u7ee7\u7eed', '\u5168\u90e8\u53d6\u6d88', '\u6e90\u6587\u4ef6', '\u72b6\u6001', '\u8fdb\u5ea6', '\u6279\u6b21', '\u53d6\u6d88\u6240\u6709\u4efb\u52a1', '\u53d6\u6d88\u6279\u6b21', '\u6b63\u5728\u8fd0\u884c\u7684\u4efb\u52a1\u5c06\u505c\u6b62\uff0c\u672a\u5b8c\u6210\u7684\u672c\u5730\u4efb\u52a1\u4ecd\u53ef\u6062\u590d\u3002', '\u4fdd\u7559\u4efb\u52a1', '\u786e\u8ba4\u53d6\u6d88', '\u5168\u90e8', '\u6d3b\u52a8\u4e2d', '\u5df2\u6682\u505c', '\u5df2\u5b8c\u6210', '\u5931\u8d25', '\u5df2\u53d6\u6d88', '\u7f3a\u5931\u6e90\u6587\u4ef6', '\u7f3a\u5931\u8f93\u51fa\u6587\u4ef6', '\u66f4\u65b0\u65f6\u95f4', '\u64cd\u4f5c', '\u5b9a\u4f4d\u6e90\u6587\u4ef6', '\u7ee7\u7eed\u4efb\u52a1', '\u6253\u5f00\u8f93\u51fa\u6587\u4ef6', '\u5728\u6587\u4ef6\u5939\u4e2d\u663e\u793a', '\u6b63\u5728\u8bfb\u53d6\u672c\u5730\u89c6\u9891\u6587\u4ef6', '\u6b63\u5728\u51c6\u5907\u53ef\u6062\u590d\u7684\u684c\u9762\u5de5\u4f5c\u6d41', '\u6b63\u5728\u4fdd\u5b58\u6700\u7ec8\u89c6\u9891\u5230\u6240\u9009\u76ee\u5f55', '\u6700\u7ec8\u6587\u4ef6\u5df2\u4fdd\u5b58\uff0c\u6b63\u5728\u786e\u8ba4\u79ef\u5206\u9884\u7559', '\u79ef\u5206\u9884\u7559\u786e\u8ba4\u4ecd\u5728\u7b49\u5f85\u91cd\u8bd5',
      '\u6392\u961f\u4e2d', '\u8fd0\u884c\u4e2d', '\u5df2\u4e2d\u65ad', '\u5df2\u6210\u529f', '\u7a7a\u95f2', '\u51c6\u5907\u4e2d', '\u5206\u6790\u4e2d', '\u751f\u6210\u6587\u6848', '\u751f\u6210\u914d\u97f3', '\u5408\u6210\u89c6\u9891', '\u5bfc\u51fa\u4e2d',
    ]
    for (const source of sources) {
      for (const locale of ['en', 'fr', 'de'] as const) {
        expect(translateText(source, locale), `${source} -> ${locale}`).not.toMatch(/[\u4e00-\u9fff]/)
      }
    }
  })

  it('translates desktop status and stage labels', () => {
    const sources = ['\u5931\u8d25', '\u5df2\u53d6\u6d88', '\u5408\u6210\u89c6\u9891', '\u5df2\u5b8c\u6210']

    for (const source of sources) {
      for (const locale of ['en', 'fr', 'de'] as const) {
        expect(translateText(source, locale), `${source} -> ${locale}`).not.toMatch(/[\u4e00-\u9fff]/)
      }
    }
  })

  it('resolves required desktop option sources from canonical Unicode-key dictionary entries', () => {
    const expected = {
      '\u8f93\u51fa\u8bed\u8a00': ['Output language', 'Langue de sortie', 'Ausgabesprache'],
      '\u4e2d\u6587': ['Chinese', 'Chinois', 'Chinesisch'],
      '\u82f1\u8bed': ['English', 'Anglais', 'Englisch'],
      '\u65e5\u8bed': ['Japanese', 'Japonais', 'Japanisch'],
      '\u97e9\u8bed': ['Korean', 'Cor\u00e9en', 'Koreanisch'],
      '\u4fc4\u8bed': ['Russian', 'Russe', 'Russisch'],
      '\u610f\u5927\u5229\u8bed': ['Italian', 'Italien', 'Italienisch'],
      '\u89e3\u8bf4\u98ce\u683c': ['Narration style', 'Style de narration', 'Erz\u00e4hlstil'],
      '\u7535\u5f71\u7535\u89c6\u5267': ['Film and television', 'Film et television', 'Film und Fernsehen'],
      '\u60ac\u7591\u89e3\u8bf4': ['Mystery narration', 'Narration mystere', 'Mystery-Erzahlung'],
      '\u7eaa\u5f55\u7247\u89e3\u8bf4': ['Documentary narration', 'Narration documentaire', 'Dokumentar-Erzahlung'],
      '\u6267\u884c\u6a21\u5f0f': ['Execution mode', 'Mode d execution', 'Ausfuhrungsmodus'],
      '\u771f\u5b9e\u526a\u8f91': ['Real editing', 'Montage reel', 'Echter Schnitt'],
      '\u6a21\u62df\u6267\u884c': ['Simulated execution', 'Execution simulee', 'Simulierte Ausfuhrung'],
      '\u80cc\u666f\u97f3\u4e50': ['Background music', 'Musique de fond', 'Hintergrundmusik'],
      '\u65e0\u80cc\u666f\u97f3\u4e50': ['No background music', 'Aucune musique de fond', 'Keine Hintergrundmusik'],
      '\u9ed8\u8ba4\u80cc\u666f\u97f3\u4e50': ['Default background music', 'Musique de fond par defaut', 'Standard-Hintergrundmusik'],
      '\u914d\u97f3\u97f3\u8272': ['Voiceover voice', 'Voix de narration', 'Voiceover-Stimme'],
      '\u8bf7\u9009\u62e9\u914d\u97f3\u97f3\u8272': ['Select a voiceover voice', 'S\u00e9lectionnez une voix', 'Voiceover-Stimme ausw\u00e4hlen'],
      '\u6b63\u5728\u52a0\u8f7d\u53ef\u7528\u97f3\u8272\u2026': ['Loading available voices...', 'Chargement des voix disponibles...', 'Verfugbare Stimmen werden geladen...'],
      '\u97f3\u8272\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002': ['Voice loading failed. Please try again.', 'Le chargement des voix a echoue. Veuillez reessayer.', 'Das Laden der Stimmen ist fehlgeschlagen. Bitte versuchen Sie es erneut.'],
      '\u6ca1\u6709\u4e0e\u6240\u9009\u8f93\u51fa\u8bed\u8a00\u517c\u5bb9\u7684\u97f3\u8272\u3002': ['No voices are compatible with the selected output language.', 'Aucune voix n est compatible avec la langue de sortie selectionnee.', 'Keine Stimmen sind mit der ausgewahlten Ausgabesprache kompatibel.'],
      '\u684c\u9762\u5de5\u4f5c\u6d41\u6b63\u5728\u8fd0\u884c': ['Desktop workflow is running', 'Le flux de travail du bureau est en cours', 'Desktop-Arbeitsablauf wird ausgefuhrt'],
      '\u5de5\u4f5c\u6d41\u6b63\u5728\u8fd0\u884c': ['Workflow is running', 'Le flux de travail est en cours', 'Arbeitsablauf wird ausgefuhrt'],
      '\u65e0\u6cd5\u4fdd\u5b58\u6700\u65b0\u684c\u9762\u5de5\u4f5c\u6d41\u68c0\u67e5\u70b9': ['Unable to save the latest desktop workflow checkpoint', 'Impossible d enregistrer le dernier point de controle du flux de travail du bureau', 'Der neueste Desktop-Arbeitsablauf-Prufpunkt kann nicht gespeichert werden'],
      '\u6700\u7ec8\u89c6\u9891\u5df2\u4fdd\u5b58': ['Final video saved', 'Video final enregistre', 'Finales Video gespeichert'],
      '\u6e90\u6587\u4ef6\u5df2\u6062\u590d': ['Source file restored', 'Fichier source restaure', 'Quelldatei wiederhergestellt'],
      '\u6e90\u6587\u4ef6\u5df2\u6062\u590d\uff0c\u53ef\u4ee5\u7ee7\u7eed\u4efb\u52a1': ['Source file restored. You can resume the task.', 'Fichier source restaure. Vous pouvez reprendre la tache.', 'Quelldatei wiederhergestellt. Sie konnen die Aufgabe fortsetzen.'],
    } as const

    for (const [source, [en, fr, de]] of Object.entries(expected)) {
      expect(dictionary[source]).toEqual({ en, fr, de })
      expect(translateText(source, 'en')).toBe(en)
      expect(translateText(source, 'fr')).toBe(fr)
      expect(translateText(source, 'de')).toBe(de)
    }
  })

  it('uses English as the non-Chinese default translation target', () => {
    expect(translateText('登录', 'en')).toBe('Log in')
  })

  it('translates shared page strings into every supported non-default locale', () => {
    expect(translateText('创建项目', 'fr')).toBe('Créer un projet')
    expect(translateText('创建项目', 'de')).toBe('Projekt erstellen')
  })

  it('translates pricing page copy and dynamic top-up labels', () => {
    expect(translateText('Credits有效期是多久？', 'en')).toBe('How long are credits valid?')
    expect(translateText('选择适合当前产能的套餐', 'en')).toBe(
      'Choose the package that fits your current production capacity'
    )
    expect(translateText('充值 100,000 Credits', 'en')).toBe('Top up 100,000 credits')
    expect(translateText('可获得', 'en')).toBe('Includes')
    expect(translateText('立即升级', 'fr')).toBe('Mettre à niveau')
    expect(translateText('立即升级', 'de')).toBe('Jetzt upgraden')
  })

  it('translates subscription page account, plan, and top-up copy', () => {
    const samples = [
      '查看账户余额、当前订阅等级，并按创作节奏选择订阅或充值。',
      '账户余额',
      '当前可用余额',
      '订阅余额',
      '充值余额',
      '当前订阅等级',
      '使用中',
      '计费周期',
      '每月额度',
      '当前周期至 2026/6/10',
      '管理订阅',
      '订阅计划',
      '稳定创作建议选择订阅，Credits 按月发放，优先消耗订阅额度。',
      '查看订阅计划',
      '按量付费',
      '项目制或临时扩容时直接充值，购买 Credits 永久有效。',
      '选择充值套餐',
      '选择订阅等级',
      '选择月付或年付，订阅额度每月自动发放。',
      '购买 Credits',
      '选择金额，支付后即时到账。',
      '微信充值',
      '银行卡支付',
      '月付，每月发放 5,000 Credits',
      '含赠送 1,000',
    ]

    samples.forEach((source) => {
      expect(translateText(source, 'en'), source).not.toMatch(/[\u4e00-\u9fff]/)
    })
  })

  it('translates the simplified subscription page copy and dynamic credit rows', () => {
    const samples = [
      '余额、等级与购买入口，都在这里。',
      '可用余额',
      '当前等级',
      '订阅入口',
      '每月自动发放额度，适合稳定创作。',
      '查看订阅方案',
      '按量付费入口',
      '一次购买 Credits，项目制或临时扩容更灵活。',
      '每月 0 Credits',
      '年付，每月发放 300,000 Credits',
      '微信折合 ￥101.47',
      '正在加载订阅方案...',
      '正在加载充值套餐...',
    ]

    samples.forEach((source) => {
      locales.filter((locale) => locale !== 'zh-CN').forEach((locale) => {
        expect(translateText(source, locale), `${source} -> ${locale}`).not.toMatch(/[\u4e00-\u9fff]/)
      })
    })
  })

  it('translates project workflow media preview and rail copy', () => {
    expect(translateText('元数据', 'en')).toBe('Metadata')
    expect(translateText('分辨率', 'en')).toBe('Resolution')
    expect(translateText('未知', 'en')).toBe('Unknown')
    expect(translateText('需要重新选择本地视频', 'en')).toBe('Please choose the local video again')
    expect(translateText('选择本地视频', 'en')).toBe('Choose local video')
    expect(translateText('等待识别结果', 'en')).toBe('Waiting for recognition results')
    expect(translateText('拖拽或选择文件上传', 'en')).toBe('Drag or choose a file to upload')
    expect(translateText('选择文件', 'en')).toBe('Choose file')
    expect(translateText('视频裁剪', 'en')).toBe('Video cropping')
    expect(translateText('选择裁剪范围', 'en')).toBe('Select crop range')
    expect(translateText('字幕识别引擎', 'en')).toBe('Subtitle recognition engine')
  })

  it('translates configuration workflow and script generation copy', () => {
    expect(translateText('智能分析', 'en')).toBe('AI analysis')
    expect(translateText('默认配置', 'en')).toBe('Default configuration')
    expect(translateText('配置摘要', 'en')).toBe('Configuration summary')
    expect(translateText('正在生成脚本', 'en')).toBe('Generating script')
    expect(translateText('开始生成文案', 'en')).toBe('Start generating copy')
    expect(translateText('默认 800-1000 字', 'en')).toBe('Default 800-1000 words')
    expect(translateText('12 个分镜', 'en')).toBe('12 storyboards')
    expect(translateText('智能脚本已生成（消耗 1,234 tokens）', 'en')).toBe('AI script generated (1,234 tokens used)')
    expect(translateText('上一项：内容组成与语言', 'en')).toBe('Previous: Content mix and languages')
    expect(translateText('共 30 项', 'en')).toBe('Total 30 items')
    expect(translateText('脚本 · 30 条', 'en')).toBe('Script · 30 items')
    expect(translateText('待生成 14 条配音，完成后可合成预览或导出剪映草稿。', 'en')).toBe(
      '14 voiceovers pending. Once done, you can preview composition or export a Jianying draft.'
    )
    expect(translateText('音频已生成 · 1.2s', 'en')).toBe('Audio generated · 1.2s')
    expect(translateText('已配音 ', 'en')).toBe('Voiced ')
    expect(translateText('待配音 ', 'en')).toBe('Pending voiceover ')
    expect(translateText('序号', 'en')).toBe('No.')
    expect(translateText('刚刚最后编辑', 'en')).toBe('Just edited')
    expect(translateText('2小时前最后编辑', 'en')).toBe('Last edited 2 hours ago')
  })

  it('translates frame workflow progress modal copy and dynamic progress messages', () => {
    expect(translateText('正在执行通用模式', 'en')).toBe('Running general mode')
    expect(translateText('返回项目页面', 'en')).toBe('Back to projects')
    expect(translateText('合并视频', 'en')).toBe('Merge videos')
    expect(translateText('正在执行：合并视频', 'en')).toBe('Running: Merge videos')
    expect(translateText('正在处理：提取音频，已用时 3s。', 'en')).toBe('Processing: Extract audio. 3s elapsed.')
    expect(translateText('字幕 8 段', 'en')).toBe('Subtitles 8 segments')
    expect(translateText('正在生成时间线图 2/5', 'en')).toBe('Generating timeline image 2/5')
    expect(translateText('当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。', 'en')).toBe(
      'This browser cannot decode the video. Please switch to the latest Google Chrome or Microsoft Edge and try again.'
    )
    expect(translateText('执行失败：当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。', 'en')).toBe(
      'Failed: This browser cannot decode the video. Please switch to the latest Google Chrome or Microsoft Edge and try again.'
    )
    expect(translateText('生成时间线图: 当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。', 'fr')).toBe(
      'Générer les images de la timeline: Ce navigateur ne peut pas décoder la vidéo. Veuillez passer à la dernière version de Google Chrome ou Microsoft Edge, puis réessayer.'
    )
    expect(translateText('当前浏览器无法解码该视频。请切换到最新版 Google Chrome 或 Microsoft Edge 后重试。', 'de')).toBe(
      'Dieser Browser kann das Video nicht dekodieren. Bitte wechseln Sie zur neuesten Version von Google Chrome oder Microsoft Edge und versuchen Sie es erneut.'
    )
    expect(translateText('正在上传最终视频 87%', 'en')).toBe('Uploading final video 87%')
    expect(translateText('已完成 8 个视觉片段分析', 'en')).toBe('8 visual segments analyzed')
    expect(translateText('已生成 12 条脚本', 'en')).toBe('12 script items generated')
    expect(translateText('Token 用量：1,234', 'en')).toBe('Token usage: 1,234')
  })

  it('translates frame workflow upload limits and validation messages', () => {
    expect(
      translateText('支持上传最多 10 个视频，合计最大 2 GB，格式支持 MP4, MKV, MPEG, MPG, 3GPP', 'en')
    ).toBe('Upload up to 10 videos, total size up to 2 GB. Supported formats: MP4, MKV, MPEG, MPG, 3GPP')
    expect(translateText('已选择 2 个视频', 'en')).toBe('2 videos selected')
    expect(translateText('合计 32.4 MB，可继续追加，最多 10 个', 'en')).toBe(
      '32.4 MB total. You can add more, up to 10 videos.'
    )
    expect(translateText('已跳过超出总大小上限 2 GB 的视频', 'en')).toBe(
      'Skipped videos that exceed the total size limit of 2 GB'
    )
  })

  it('keeps Chinese unchanged', () => {
    expect(translateText('创建项目', 'zh-CN')).toBe('创建项目')
  })

  it('keeps translation entries complete for supported locales', () => {
    const nonSourceLocales = locales.filter((locale) => locale !== 'zh-CN')

    Object.entries(dictionary).forEach(([source, translations]) => {
      nonSourceLocales.forEach((locale) => {
        expect(translations[locale], `${source} missing ${locale}`).toBeTruthy()
      })
    })
  })
})
