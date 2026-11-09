import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import {
  dictionary,
  dictionarySources,
  englishFallbackDictionary,
  englishFallbackSources,
} from './dictionary'
import { defaultLocale, isLocale, type Locale } from './locales'

const STORAGE_KEY = 'narratoai-locale'
const textNodeOriginals = new WeakMap<Text, string>()
const textNodeRendered = new WeakMap<Text, string>()
const attrOriginals = new WeakMap<Element, Map<string, string>>()
const attrRendered = new WeakMap<Element, Map<string, string>>()
const inputValueOriginals = new WeakMap<HTMLInputElement, string>()
const translatedAttributeNames = ['aria-label', 'title', 'placeholder', 'alt']

export interface I18nProviderProps {
  children: ReactNode
  initialLocale?: Locale
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (source: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

function getLocaleFromQuery(): Locale | null {
  if (typeof window === 'undefined') return null
  const locale = new URLSearchParams(window.location.search).get('locale')
  return isLocale(locale) ? locale : null
}

export function resolveInitialLocale(initialLocale?: Locale): Locale {
  const requestedLocale = getLocaleFromQuery()
  if (requestedLocale) return requestedLocale
  const stored = localStorage.getItem(STORAGE_KEY)
  return isLocale(stored) ? stored : initialLocale ?? defaultLocale
}

function hasChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text)
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function shouldSkipElement(element: Element | null) {
  if (!element) return true
  return Boolean(element.closest('[data-i18n-skip], script, style, svg, canvas, video, audio'))
}

function translatePattern(source: string, locale: Exclude<Locale, 'zh-CN'>) {
  const normalizedSource = normalizeText(source)
  const nested = (text: string) => translateText(text, locale)
  const earnedCredits = normalizedSource.match(/^可获得 ([\d,]+) Credits$/)
  if (earnedCredits?.[1]) {
    return {
      en: `Includes ${earnedCredits[1]} credits`,
      fr: `Inclut ${earnedCredits[1]} crédits`,
      de: `Enthält ${earnedCredits[1]} Credits`,
    }[locale]
  }

  const estimatedVideos = normalizedSource.match(/^约可剪辑 ([\d,]+) 条视频$/)
  if (estimatedVideos?.[1]) {
    return {
      en: `Edits about ${estimatedVideos[1]} videos`,
      fr: `Environ ${estimatedVideos[1]} vidéos montées`,
      de: `Bearbeitet etwa ${estimatedVideos[1]} Videos`,
    }[locale]
  }

  const rechargeCredits = normalizedSource.match(/^充值 ([\d,]+) Credits$/)
  if (rechargeCredits?.[1]) {
    return {
      en: `Top up ${rechargeCredits[1]} credits`,
      fr: `Recharger ${rechargeCredits[1]} crédits`,
      de: `${rechargeCredits[1]} Credits aufladen`,
    }[locale]
  }

  const totalCredits = normalizedSource.match(/^共 ([\d,]+) Credits$/)
  if (totalCredits?.[1]) {
    return {
      en: `${totalCredits[1]} credits total`,
      fr: `${totalCredits[1]} crédits au total`,
      de: `${totalCredits[1]} Credits gesamt`,
    }[locale]
  }

  const monthlyCredits = normalizedSource.match(/^([\d,]+) Credits \/ 月$/)
  if (monthlyCredits?.[1]) {
    return {
      en: `${monthlyCredits[1]} credits / month`,
      fr: `${monthlyCredits[1]} crédits / mois`,
      de: `${monthlyCredits[1]} Credits / Monat`,
    }[locale]
  }

  const currentMonthlyCredits = normalizedSource.match(/^每月 ([\d,]+) Credits$/)
  if (currentMonthlyCredits?.[1]) {
    return {
      en: `${currentMonthlyCredits[1]} credits / month`,
      fr: `${currentMonthlyCredits[1]} crédits / mois`,
      de: `${currentMonthlyCredits[1]} Credits / Monat`,
    }[locale]
  }

  const issuedCredits = normalizedSource.match(/^(月付|年付)，每月发放 ([\d,]+) Credits$/)
  if (issuedCredits?.[1] && issuedCredits[2]) {
    const cycle = translateText(issuedCredits[1], locale)
    return {
      en: `${cycle}, ${issuedCredits[2]} credits issued each month`,
      fr: `${cycle}, ${issuedCredits[2]} crédits attribués chaque mois`,
      de: `${cycle}, ${issuedCredits[2]} Credits monatlich`,
    }[locale]
  }

  const wechatEquivalent = normalizedSource.match(/^微信折合 (.+)$/)
  if (wechatEquivalent?.[1]) {
    return {
      en: `WeChat equivalent ${wechatEquivalent[1]}`,
      fr: `Équivalent WeChat ${wechatEquivalent[1]}`,
      de: `WeChat-Gegenwert ${wechatEquivalent[1]}`,
    }[locale]
  }

  const includedBonus = normalizedSource.match(/^含赠送 ([\d,]+)$/)
  if (includedBonus?.[1]) {
    return {
      en: `Includes ${includedBonus[1]} bonus credits`,
      fr: `Inclut ${includedBonus[1]} crédits bonus`,
      de: `Enthält ${includedBonus[1]} Bonus-Credits`,
    }[locale]
  }

  const approximateVideoCreationAllowance = normalizedSource.match(/^约 (\d+) 个视频创作 \/ 月$/)
  if (approximateVideoCreationAllowance?.[1]) {
    return {
      en: `About ${approximateVideoCreationAllowance[1]} video creations / month`,
      fr: `Environ ${approximateVideoCreationAllowance[1]} créations vidéo / mois`,
      de: `Etwa ${approximateVideoCreationAllowance[1]} Videoprojekte / Monat`,
    }[locale]
  }

  const videoCreationAllowance = normalizedSource.match(/^(\d+) 个视频创作 \/ 月$/)
  if (videoCreationAllowance?.[1]) {
    return {
      en: `${videoCreationAllowance[1]} video creations / month`,
      fr: `${videoCreationAllowance[1]} créations vidéo / mois`,
      de: `${videoCreationAllowance[1]} Videoprojekte / Monat`,
    }[locale]
  }

  const approximateVideoCreationCount = normalizedSource.match(/^约 (\d+) 个左右$/)
  if (approximateVideoCreationCount?.[1]) {
    return {
      en: `About ${approximateVideoCreationCount[1]} videos`,
      fr: `Environ ${approximateVideoCreationCount[1]} vidéos`,
      de: `Etwa ${approximateVideoCreationCount[1]} Videos`,
    }[locale]
  }

  const videoCreationCount = normalizedSource.match(/^(\d+) 个$/)
  if (videoCreationCount?.[1]) {
    return {
      en: `${videoCreationCount[1]} videos`,
      fr: `${videoCreationCount[1]} vidéos`,
      de: `${videoCreationCount[1]} Videos`,
    }[locale]
  }

  const estimatedStandardVideos = normalizedSource.match(/^约可剪辑 ([\d,]+) 条标准视频$/)
  if (estimatedStandardVideos?.[1]) {
    return {
      en: `Edits about ${estimatedStandardVideos[1]} standard videos`,
      fr: `Environ ${estimatedStandardVideos[1]} vidéos standard montées`,
      de: `Bearbeitet etwa ${estimatedStandardVideos[1]} Standardvideos`,
    }[locale]
  }

  const defaultWordCount = normalizedSource.match(/^默认 ([\d,-]+) 字$/)
  if (defaultWordCount?.[1]) {
    return {
      en: `Default ${defaultWordCount[1]} words`,
      fr: `${defaultWordCount[1]} mots par défaut`,
      de: `Standard ${defaultWordCount[1]} Wörter`,
    }[locale]
  }

  const wordCount = normalizedSource.match(/^([\d,-]+) 字$/)
  if (wordCount?.[1]) {
    return {
      en: `${wordCount[1]} words`,
      fr: `${wordCount[1]} mots`,
      de: `${wordCount[1]} Wörter`,
    }[locale]
  }

  const totalItems = normalizedSource.match(/^共 (\d+) 项$/)
  if (totalItems?.[1]) {
    return {
      en: `Total ${totalItems[1]} items`,
      fr: `${totalItems[1]} éléments au total`,
      de: `${totalItems[1]} Einträge gesamt`,
    }[locale]
  }

  const scriptItems = normalizedSource.match(/^脚本 · (\d+) 条$/)
  if (scriptItems?.[1]) {
    return {
      en: `Script · ${scriptItems[1]} items`,
      fr: `Script · ${scriptItems[1]} éléments`,
      de: `Skript · ${scriptItems[1]} Einträge`,
    }[locale]
  }

  const scriptCount = normalizedSource.match(/^(\d+) 条脚本$/)
  if (scriptCount?.[1]) {
    return {
      en: `${scriptCount[1]} script items`,
      fr: `${scriptCount[1]} éléments de script`,
      de: `${scriptCount[1]} Skripteinträge`,
    }[locale]
  }

  const voicedRatio = normalizedSource.match(/^已配音 · (\d+)\/(\d+)$/)
  if (voicedRatio?.[1]) {
    return {
      en: `Voiced · ${voicedRatio[1]}/${voicedRatio[2]}`,
      fr: `Doublé · ${voicedRatio[1]}/${voicedRatio[2]}`,
      de: `Vertont · ${voicedRatio[1]}/${voicedRatio[2]}`,
    }[locale]
  }

  const videoBadge = normalizedSource.match(/^视频 · (.+)$/)
  if (videoBadge?.[1]) {
    const value = dictionary[videoBadge[1]]?.[locale] ?? videoBadge[1]
    return {
      en: `Video · ${value}`,
      fr: `Vidéo · ${value}`,
      de: `Video · ${value}`,
    }[locale]
  }

  const voicedCount = normalizedSource.match(/^已配音 (\d+) 条?$/)
  if (voicedCount?.[1]) {
    return {
      en: `${voicedCount[1]} voiced`,
      fr: `${voicedCount[1]} doublés`,
      de: `${voicedCount[1]} vertont`,
    }[locale]
  }

  const narrationCount = normalizedSource.match(/^解说 (\d+)$/)
  if (narrationCount?.[1]) {
    return {
      en: `Narration ${narrationCount[1]}`,
      fr: `Narration ${narrationCount[1]}`,
      de: `Sprechertext ${narrationCount[1]}`,
    }[locale]
  }

  const pendingVoiceCount = normalizedSource.match(/^待配音 (\d+)$/)
  if (pendingVoiceCount?.[1]) {
    return {
      en: `${pendingVoiceCount[1]} pending`,
      fr: `${pendingVoiceCount[1]} en attente`,
      de: `${pendingVoiceCount[1]} ausstehend`,
    }[locale]
  }

  const pendingVoiceLine = normalizedSource.match(/^待生成 (\d+) 条配音，完成后可合成预览或导出剪映草稿。$/)
  if (pendingVoiceLine?.[1]) {
    return {
      en: `${pendingVoiceLine[1]} voiceovers pending. Once done, you can preview composition or export a Jianying draft.`,
      fr: `${pendingVoiceLine[1]} voix off en attente. Une fois terminé, vous pouvez prévisualiser ou exporter un brouillon Jianying.`,
      de: `${pendingVoiceLine[1]} Voiceovers ausstehend. Danach Vorschau erstellen oder Jianying-Entwurf exportieren.`,
    }[locale]
  }

  const audioGeneratedDuration = normalizedSource.match(/^音频已生成 · (.+)$/)
  if (audioGeneratedDuration?.[1]) {
    return {
      en: `Audio generated · ${audioGeneratedDuration[1]}`,
      fr: `Audio généré · ${audioGeneratedDuration[1]}`,
      de: `Audio generiert · ${audioGeneratedDuration[1]}`,
    }[locale]
  }

  const unreadableAudio = normalizedSource.match(/^有 (\d+) 个音频片段无法读取时长，未能确认是否需要校准$/)
  if (unreadableAudio?.[1]) {
    return {
      en: `${unreadableAudio[1]} audio segments could not be read, so calibration need could not be confirmed`,
      fr: `${unreadableAudio[1]} segments audio sont illisibles, impossible de confirmer le besoin de calibrage`,
      de: `${unreadableAudio[1]} Audiosegmente konnten nicht gelesen werden; Kalibrierungsbedarf unklar`,
    }[locale]
  }

  const calibratedAudio = normalizedSource.match(/^已成功校准 (\d+) 个音频片段的时间戳$/)
  if (calibratedAudio?.[1]) {
    return {
      en: `Successfully calibrated timestamps for ${calibratedAudio[1]} audio segments`,
      fr: `Horodatages calibrés pour ${calibratedAudio[1]} segments audio`,
      de: `Zeitstempel für ${calibratedAudio[1]} Audiosegmente erfolgreich kalibriert`,
    }[locale]
  }

  const selectRow = normalizedSource.match(/^选择第 (\d+) 行$/)
  if (selectRow?.[1]) {
    return {
      en: `Select row ${selectRow[1]}`,
      fr: `Sélectionner la ligne ${selectRow[1]}`,
      de: `Zeile ${selectRow[1]} auswählen`,
    }[locale]
  }

  const storyboardCount = normalizedSource.match(/^(\d+) 个分镜$/)
  if (storyboardCount?.[1]) {
    return {
      en: `${storyboardCount[1]} storyboards`,
      fr: `${storyboardCount[1]} plans`,
      de: `${storyboardCount[1]} Storyboards`,
    }[locale]
  }

  const generatedTokens = normalizedSource.match(/^智能脚本已生成（消耗 ([\d,]+) tokens）$/)
  if (generatedTokens?.[1]) {
    return {
      en: `AI script generated (${generatedTokens[1]} tokens used)`,
      fr: `Script IA généré (${generatedTokens[1]} tokens consommés)`,
      de: `KI-Skript erstellt (${generatedTokens[1]} Tokens verbraucht)`,
    }[locale]
  }

  const currentConfig = normalizedSource.match(/^当前在配置“(.+)”。完成后可继续下一项，也可以直接保存并开始生成。$/)
  if (currentConfig?.[1]) {
    const section = dictionary[currentConfig[1]]?.[locale] ?? currentConfig[1]
    return {
      en: `Currently configuring “${section}”. After this, continue to the next item or save and start generation directly.`,
      fr: `Configuration actuelle « ${section} ». Ensuite, passez à l’élément suivant ou enregistrez et lancez la génération.`,
      de: `Aktuell konfiguriert „${section}“. Danach weiter zum nächsten Punkt oder direkt speichern und starten.`,
    }[locale]
  }

  const previousSection = normalizedSource.match(/^上一项：(.+)$/)
  if (previousSection?.[1]) {
    const section = dictionary[previousSection[1]]?.[locale] ?? previousSection[1]
    return {
      en: `Previous: ${section}`,
      fr: `Précédent : ${section}`,
      de: `Zurück: ${section}`,
    }[locale]
  }

  const nextSection = normalizedSource.match(/^下一项：(.+)$/)
  if (nextSection?.[1]) {
    const section = dictionary[nextSection[1]]?.[locale] ?? nextSection[1]
    return {
      en: `Next: ${section}`,
      fr: `Suivant : ${section}`,
      de: `Weiter: ${section}`,
    }[locale]
  }

  const previewSubtitleCount = normalizedSource.match(/^字幕 (\d+) 段$/)
  if (previewSubtitleCount?.[1]) {
    return {
      en: `Subtitles ${previewSubtitleCount[1]} segments`,
      fr: `Sous-titres ${previewSubtitleCount[1]} segments`,
      de: `Untertitel ${previewSubtitleCount[1]} Segmente`,
    }[locale]
  }

  const previewDecisionCount = normalizedSource.match(/^决策 (\d+) 项$/)
  if (previewDecisionCount?.[1]) {
    return {
      en: `Decisions ${previewDecisionCount[1]} items`,
      fr: `Décisions ${previewDecisionCount[1]} éléments`,
      de: `Entscheidungen ${previewDecisionCount[1]} Einträge`,
    }[locale]
  }

  const previewAnalysisCount = normalizedSource.match(/^视觉分析 (\d+) 项$/)
  if (previewAnalysisCount?.[1]) {
    return {
      en: `Visual analysis ${previewAnalysisCount[1]} items`,
      fr: `Analyse visuelle ${previewAnalysisCount[1]} éléments`,
      de: `Visuelle Analyse ${previewAnalysisCount[1]} Einträge`,
    }[locale]
  }

  const workflowRunning = normalizedSource.match(/^正在执行：(.+)$/)
  if (workflowRunning?.[1]) {
    const step = nested(workflowRunning[1])
    return {
      en: `Running: ${step}`,
      fr: `En cours : ${step}`,
      de: `Wird ausgeführt: ${step}`,
    }[locale]
  }

  const workflowStarted = normalizedSource.match(/^开始执行：(.+)$/)
  if (workflowStarted?.[1]) {
    const step = nested(workflowStarted[1])
    return {
      en: `Started: ${step}`,
      fr: `Démarré : ${step}`,
      de: `Gestartet: ${step}`,
    }[locale]
  }

  const workflowStepSucceeded = normalizedSource.match(/^执行成功：已生成 (.+) 的输出摘要。$/)
  if (workflowStepSucceeded?.[1]) {
    const step = nested(workflowStepSucceeded[1])
    return {
      en: `${step} completed`,
      fr: `${step} terminé`,
      de: `${step} abgeschlossen`,
    }[locale]
  }

  const workflowStepFailed = normalizedSource.match(/^执行失败：(.+)$/)
  if (workflowStepFailed?.[1]) {
    const message = nested(workflowStepFailed[1])
    return {
      en: `Failed: ${message}`,
      fr: `Échec : ${message}`,
      de: `Fehlgeschlagen: ${message}`,
    }[locale]
  }

  const workflowStepSkipped = normalizedSource.match(/^已跳过：(.+)$/)
  if (workflowStepSkipped?.[1]) {
    return {
      en: `Skipped: ${workflowStepSkipped[1]}`,
      fr: `Ignoré : ${workflowStepSkipped[1]}`,
      de: `Übersprungen: ${workflowStepSkipped[1]}`,
    }[locale]
  }

  const workflowStepStopped = normalizedSource.match(/^已停止：(.+)$/)
  if (workflowStepStopped?.[1]) {
    return {
      en: `Stopped: ${workflowStepStopped[1]}`,
      fr: `Arrêté : ${workflowStepStopped[1]}`,
      de: `Gestoppt: ${workflowStepStopped[1]}`,
    }[locale]
  }

  const workflowCompleted = normalizedSource.match(/^已完成：(.+)$/)
  if (workflowCompleted?.[1]) {
    const step = nested(workflowCompleted[1])
    return {
      en: `Completed: ${step}`,
      fr: `Terminé : ${step}`,
      de: `Abgeschlossen: ${step}`,
    }[locale]
  }

  const workflowFailed = normalizedSource.match(/^(.+) 执行失败$/)
  if (workflowFailed?.[1]) {
    const step = nested(workflowFailed[1])
    return {
      en: `${step} failed`,
      fr: `${step} a échoué`,
      de: `${step} fehlgeschlagen`,
    }[locale]
  }

  const prepareMergeVideos = normalizedSource.match(/^准备合并 (\d+) 个视频$/)
  if (prepareMergeVideos?.[1]) {
    return {
      en: `Preparing to merge ${prepareMergeVideos[1]} videos`,
      fr: `Préparation de la fusion de ${prepareMergeVideos[1]} vidéos`,
      de: `${prepareMergeVideos[1]} Videos werden zum Zusammenführen vorbereitet`,
    }[locale]
  }

  const mergingVideo = normalizedSource.match(/^正在合并第 (\d+)\/(\d+) 个视频$/)
  if (mergingVideo?.[1]) {
    return {
      en: `Merging video ${mergingVideo[1]}/${mergingVideo[2]}`,
      fr: `Fusion de la vidéo ${mergingVideo[1]}/${mergingVideo[2]}`,
      de: `Video ${mergingVideo[1]}/${mergingVideo[2]} wird zusammengeführt`,
    }[locale]
  }

  const generatingTimelineImage = normalizedSource.match(/^正在生成时间线图 (\d+)\/(\d+)$/)
  if (generatingTimelineImage?.[1]) {
    return {
      en: `Generating timeline image ${generatingTimelineImage[1]}/${generatingTimelineImage[2]}`,
      fr: `Génération de l’image de timeline ${generatingTimelineImage[1]}/${generatingTimelineImage[2]}`,
      de: `Zeitleistenbild ${generatingTimelineImage[1]}/${generatingTimelineImage[2]} wird erzeugt`,
    }[locale]
  }

  const generatedTimelineImages = normalizedSource.match(/^已生成 (\d+) 张时间线图$/)
  if (generatedTimelineImages?.[1]) {
    return {
      en: `${generatedTimelineImages[1]} timeline images generated`,
      fr: `${generatedTimelineImages[1]} images de timeline générées`,
      de: `${generatedTimelineImages[1]} Zeitleistenbilder erzeugt`,
    }[locale]
  }

  const preparingVisualAnalysis = normalizedSource.match(/^正在准备视觉分析 (\d+)\/(\d+)$/)
  if (preparingVisualAnalysis?.[1]) {
    return {
      en: `Preparing visual analysis ${preparingVisualAnalysis[1]}/${preparingVisualAnalysis[2]}`,
      fr: `Préparation de l’analyse visuelle ${preparingVisualAnalysis[1]}/${preparingVisualAnalysis[2]}`,
      de: `Visuelle Analyse ${preparingVisualAnalysis[1]}/${preparingVisualAnalysis[2]} wird vorbereitet`,
    }[locale]
  }

  const uploadingTimelineImage = normalizedSource.match(/^正在上传时间线图 (\d+)\/(\d+)$/)
  if (uploadingTimelineImage?.[1]) {
    return {
      en: `Uploading timeline image ${uploadingTimelineImage[1]}/${uploadingTimelineImage[2]}`,
      fr: `Téléversement de l’image de timeline ${uploadingTimelineImage[1]}/${uploadingTimelineImage[2]}`,
      de: `Zeitleistenbild ${uploadingTimelineImage[1]}/${uploadingTimelineImage[2]} wird hochgeladen`,
    }[locale]
  }

  const uploadedTimelineImage = normalizedSource.match(/^已上传时间线图，等待视觉模型 (\d+)\/(\d+)$/)
  if (uploadedTimelineImage?.[1]) {
    return {
      en: `Timeline image uploaded. Waiting for vision model ${uploadedTimelineImage[1]}/${uploadedTimelineImage[2]}`,
      fr: `Image de timeline téléversée. En attente du modèle visuel ${uploadedTimelineImage[1]}/${uploadedTimelineImage[2]}`,
      de: `Zeitleistenbild hochgeladen. Warten auf Vision-Modell ${uploadedTimelineImage[1]}/${uploadedTimelineImage[2]}`,
    }[locale]
  }

  const visionModelAnalyzing = normalizedSource.match(/^视觉模型正在分析 (\d+)\/(\d+)$/)
  if (visionModelAnalyzing?.[1]) {
    return {
      en: `Vision model analyzing ${visionModelAnalyzing[1]}/${visionModelAnalyzing[2]}`,
      fr: `Modèle visuel en analyse ${visionModelAnalyzing[1]}/${visionModelAnalyzing[2]}`,
      de: `Vision-Modell analysiert ${visionModelAnalyzing[1]}/${visionModelAnalyzing[2]}`,
    }[locale]
  }

  const visualAnalysisCompleted = normalizedSource.match(/^视觉分析完成 (\d+)\/(\d+)$/)
  if (visualAnalysisCompleted?.[1]) {
    return {
      en: `Visual analysis completed ${visualAnalysisCompleted[1]}/${visualAnalysisCompleted[2]}`,
      fr: `Analyse visuelle terminée ${visualAnalysisCompleted[1]}/${visualAnalysisCompleted[2]}`,
      de: `Visuelle Analyse abgeschlossen ${visualAnalysisCompleted[1]}/${visualAnalysisCompleted[2]}`,
    }[locale]
  }

  const completedVisualAnalysis = normalizedSource.match(/^已完成视觉分析 (\d+)\/(\d+)$/)
  if (completedVisualAnalysis?.[1]) {
    return {
      en: `Completed visual analysis ${completedVisualAnalysis[1]}/${completedVisualAnalysis[2]}`,
      fr: `Analyse visuelle finalisée ${completedVisualAnalysis[1]}/${completedVisualAnalysis[2]}`,
      de: `Visuelle Analyse abgeschlossen ${completedVisualAnalysis[1]}/${completedVisualAnalysis[2]}`,
    }[locale]
  }

  const completedVisualSegments = normalizedSource.match(/^已完成 (\d+) 个视觉片段分析$/)
  if (completedVisualSegments?.[1]) {
    return {
      en: `${completedVisualSegments[1]} visual segments analyzed`,
      fr: `${completedVisualSegments[1]} segments visuels analysés`,
      de: `${completedVisualSegments[1]} visuelle Segmente analysiert`,
    }[locale]
  }

  const extractingMergedAudio = normalizedSource.match(/^正在提取合并视频中的音频(?: (\d+)%)?$/)
  if (extractingMergedAudio) {
    const progress = extractingMergedAudio[1]
    return {
      en: progress ? `Extracting audio from merged video ${progress}%` : 'Extracting audio from merged video',
      fr: progress ? `Extraction de l’audio de la vidéo fusionnée ${progress}%` : 'Extraction de l’audio de la vidéo fusionnée',
      de: progress ? `Audio aus zusammengeführtem Video wird extrahiert ${progress}%` : 'Audio aus zusammengeführtem Video wird extrahiert',
    }[locale]
  }

  const generatingVoiceover = normalizedSource.match(/^正在生成解说配音 (\d+)\/(\d+)$/)
  if (generatingVoiceover?.[1]) {
    return {
      en: `Generating voiceover ${generatingVoiceover[1]}/${generatingVoiceover[2]}`,
      fr: `Génération de la voix off ${generatingVoiceover[1]}/${generatingVoiceover[2]}`,
      de: `Voiceover wird erzeugt ${generatingVoiceover[1]}/${generatingVoiceover[2]}`,
    }[locale]
  }

  const uploadingFinalVideo = normalizedSource.match(/^正在上传最终视频 (\d+)%$/)
  if (uploadingFinalVideo?.[1]) {
    return {
      en: `Uploading final video ${uploadingFinalVideo[1]}%`,
      fr: `Téléversement de la vidéo finale ${uploadingFinalVideo[1]}%`,
      de: `Finales Video wird hochgeladen ${uploadingFinalVideo[1]}%`,
    }[locale]
  }

  const generatedScripts = normalizedSource.match(/^已生成 (\d+) 条脚本$/)
  if (generatedScripts?.[1]) {
    return {
      en: `${generatedScripts[1]} script items generated`,
      fr: `${generatedScripts[1]} éléments de script générés`,
      de: `${generatedScripts[1]} Skripteinträge erzeugt`,
    }[locale]
  }

  const tokenUsage = normalizedSource.match(/^Token 用量：([\d,]+)$/)
  if (tokenUsage?.[1]) {
    return {
      en: `Token usage: ${tokenUsage[1]}`,
      fr: `Utilisation des tokens : ${tokenUsage[1]}`,
      de: `Token-Verbrauch: ${tokenUsage[1]}`,
    }[locale]
  }

  const composingWithBackgroundMusic = normalizedSource.match(/^正在合成最终视频并混入背景音乐：(.+)$/)
  if (composingWithBackgroundMusic?.[1]) {
    const music = nested(composingWithBackgroundMusic[1])
    return {
      en: `Composing final video with background music: ${music}`,
      fr: `Composition de la vidéo finale avec musique de fond : ${music}`,
      de: `Finales Video wird mit Hintergrundmusik erstellt: ${music}`,
    }[locale]
  }

  const progressWithCounter = normalizedSource.match(/^(.+)：(\d+)\/(\d+)$/)
  if (progressWithCounter?.[1]) {
    const label = nested(progressWithCounter[1])
    return {
      en: `${label}: ${progressWithCounter[2]}/${progressWithCounter[3]}`,
      fr: `${label} : ${progressWithCounter[2]}/${progressWithCounter[3]}`,
      de: `${label}: ${progressWithCounter[2]}/${progressWithCounter[3]}`,
    }[locale]
  }

  const mergeProgress = normalizedSource.match(/^合并进度：(.+)$/)
  if (mergeProgress?.[1]) {
    const message = nested(mergeProgress[1])
    return {
      en: `Merge progress: ${message}`,
      fr: `Progression de la fusion : ${message}`,
      de: `Zusammenführungsfortschritt: ${message}`,
    }[locale]
  }

  const chunkProgress = normalizedSource.match(/^分片进度：(.+)$/)
  if (chunkProgress?.[1]) {
    const message = nested(chunkProgress[1])
    return {
      en: `Chunk progress: ${message}`,
      fr: `Progression des segments : ${message}`,
      de: `Chunk-Fortschritt: ${message}`,
    }[locale]
  }

  const streamStage = normalizedSource.match(/^流式阶段：(.+)$/)
  if (streamStage?.[1]) {
    const stage = nested(streamStage[1])
    return {
      en: `Stream stage: ${stage}`,
      fr: `Étape du flux : ${stage}`,
      de: `Streaming-Phase: ${stage}`,
    }[locale]
  }

  const streamError = normalizedSource.match(/^流式错误：(.+)$/)
  if (streamError?.[1]) {
    return {
      en: `Stream error: ${streamError[1]}`,
      fr: `Erreur du flux : ${streamError[1]}`,
      de: `Streaming-Fehler: ${streamError[1]}`,
    }[locale]
  }

  const modelThinking = normalizedSource.match(/^模型思考流：(.*)$/)
  if (modelThinking) {
    return {
      en: `Model reasoning stream: ${modelThinking[1]}`,
      fr: `Flux de raisonnement du modèle : ${modelThinking[1]}`,
      de: `Modell-Denkstream: ${modelThinking[1]}`,
    }[locale]
  }

  const modelOutput = normalizedSource.match(/^模型输出：(.*)$/)
  if (modelOutput) {
    return {
      en: `Model output: ${modelOutput[1]}`,
      fr: `Sortie du modèle : ${modelOutput[1]}`,
      de: `Modellausgabe: ${modelOutput[1]}`,
    }[locale]
  }

  const visualStreamListening = normalizedSource.match(/^已开始监听视觉辅助图分析流式输出：(\d+) \/ (\d+)$/)
  if (visualStreamListening?.[1]) {
    return {
      en: `Listening for visual analysis stream output: ${visualStreamListening[1]} / ${visualStreamListening[2]}`,
      fr: `Écoute du flux d’analyse visuelle : ${visualStreamListening[1]} / ${visualStreamListening[2]}`,
      de: `Streaming-Ausgabe der visuellen Analyse wird überwacht: ${visualStreamListening[1]} / ${visualStreamListening[2]}`,
    }[locale]
  }

  const streamCompleteWithSummary = normalizedSource.match(/^流式完成：模型 (.+)，Token ([\d,]+)，摘要：(.+)$/)
  if (streamCompleteWithSummary?.[1]) {
    return {
      en: `Stream complete: model ${streamCompleteWithSummary[1]}, tokens ${streamCompleteWithSummary[2]}, summary: ${streamCompleteWithSummary[3]}`,
      fr: `Flux terminé : modèle ${streamCompleteWithSummary[1]}, tokens ${streamCompleteWithSummary[2]}, résumé : ${streamCompleteWithSummary[3]}`,
      de: `Streaming abgeschlossen: Modell ${streamCompleteWithSummary[1]}, Tokens ${streamCompleteWithSummary[2]}, Zusammenfassung: ${streamCompleteWithSummary[3]}`,
    }[locale]
  }

  const streamComplete = normalizedSource.match(/^流式完成：模型 (.+)，Token ([\d,]+)$/)
  if (streamComplete?.[1]) {
    return {
      en: `Stream complete: model ${streamComplete[1]}, tokens ${streamComplete[2]}`,
      fr: `Flux terminé : modèle ${streamComplete[1]}, tokens ${streamComplete[2]}`,
      de: `Streaming abgeschlossen: Modell ${streamComplete[1]}, Tokens ${streamComplete[2]}`,
    }[locale]
  }

  const scriptStreamComplete = normalizedSource.match(/^流式完成：生成 (\d+) 条脚本，模型 (.+)$/)
  if (scriptStreamComplete?.[1]) {
    return {
      en: `Stream complete: generated ${scriptStreamComplete[1]} script items, model ${scriptStreamComplete[2]}`,
      fr: `Flux terminé : ${scriptStreamComplete[1]} éléments de script générés, modèle ${scriptStreamComplete[2]}`,
      de: `Streaming abgeschlossen: ${scriptStreamComplete[1]} Skripteinträge erzeugt, Modell ${scriptStreamComplete[2]}`,
    }[locale]
  }

  const chunkExecuting = normalizedSource.match(/^(.+) 正在执行：(\d+) 个 packed phrases，(\d+) 个候选点，(\d+) 个 observed gaps。$/)
  if (chunkExecuting?.[1]) {
    return {
      en: `${chunkExecuting[1]} running: ${chunkExecuting[2]} packed phrases, ${chunkExecuting[3]} candidates, ${chunkExecuting[4]} observed gaps.`,
      fr: `${chunkExecuting[1]} en cours : ${chunkExecuting[2]} packed phrases, ${chunkExecuting[3]} candidats, ${chunkExecuting[4]} gaps observés.`,
      de: `${chunkExecuting[1]} wird ausgeführt: ${chunkExecuting[2]} packed phrases, ${chunkExecuting[3]} Kandidaten, ${chunkExecuting[4]} beobachtete Gaps.`,
    }[locale]
  }

  const chunkRequesting = normalizedSource.match(/^(.+) 正在请求模型。$/)
  if (chunkRequesting?.[1]) {
    return {
      en: `${chunkRequesting[1]} requesting model.`,
      fr: `${chunkRequesting[1]} demande le modèle.`,
      de: `${chunkRequesting[1]} fordert das Modell an.`,
    }[locale]
  }

  const chunkStreamingPreview = normalizedSource.match(/^(.+) 流式(思考|输出)：(.+)$/)
  if (chunkStreamingPreview?.[1]) {
    const mode = chunkStreamingPreview[2]
    return {
      en: `${chunkStreamingPreview[1]} stream ${mode === '思考' ? 'reasoning' : 'output'}: ${chunkStreamingPreview[3]}`,
      fr: `${chunkStreamingPreview[1]} flux ${mode === '思考' ? 'raisonnement' : 'sortie'} : ${chunkStreamingPreview[3]}`,
      de: `${chunkStreamingPreview[1]} Stream-${mode === '思考' ? 'Denken' : 'Ausgabe'}: ${chunkStreamingPreview[3]}`,
    }[locale]
  }

  const chunkStreaming = normalizedSource.match(/^(.+) 流式响应中，已收到(思考|输出)片段。$/)
  if (chunkStreaming?.[1]) {
    const mode = chunkStreaming[2]
    return {
      en: `${chunkStreaming[1]} streaming; received ${mode === '思考' ? 'reasoning' : 'output'} chunk.`,
      fr: `${chunkStreaming[1]} en flux ; segment de ${mode === '思考' ? 'raisonnement' : 'sortie'} reçu.`,
      de: `${chunkStreaming[1]} streamt; ${mode === '思考' ? 'Denk' : 'Ausgabe'}-Segment empfangen.`,
    }[locale]
  }

  const chunkRetrying = normalizedSource.match(/^(.+) 第 (\d+) 次请求失败，(\d+)ms 后重试。$/)
  if (chunkRetrying?.[1]) {
    return {
      en: `${chunkRetrying[1]} request ${chunkRetrying[2]} failed. Retrying in ${chunkRetrying[3]}ms.`,
      fr: `La requête ${chunkRetrying[2]} de ${chunkRetrying[1]} a échoué. Nouvelle tentative dans ${chunkRetrying[3]} ms.`,
      de: `Anfrage ${chunkRetrying[2]} für ${chunkRetrying[1]} fehlgeschlagen. Neuer Versuch in ${chunkRetrying[3]} ms.`,
    }[locale]
  }

  const chunkFailed = normalizedSource.match(/^(.+) 模型请求失败，已记录诊断并跳过，不生成本地兜底决策。$/)
  if (chunkFailed?.[1]) {
    return {
      en: `${chunkFailed[1]} model request failed. Logged diagnostics and skipped without local fallback decisions.`,
      fr: `Échec de la requête modèle pour ${chunkFailed[1]}. Diagnostic enregistré et étape ignorée sans décision locale de secours.`,
      de: `Modellanfrage für ${chunkFailed[1]} fehlgeschlagen. Diagnose protokolliert und ohne lokale Fallback-Entscheidung übersprungen.`,
    }[locale]
  }

  const failedChunks = normalizedSource.match(/^(\d+) 个分片模型请求失败，已跳过；未生成本地兜底决策。$/)
  if (failedChunks?.[1]) {
    return {
      en: `${failedChunks[1]} chunk model requests failed and were skipped; no local fallback decisions were generated.`,
      fr: `${failedChunks[1]} requêtes de segments ont échoué et ont été ignorées ; aucune décision locale de secours n’a été générée.`,
      de: `${failedChunks[1]} Chunk-Anfragen sind fehlgeschlagen und wurden übersprungen; keine lokalen Fallback-Entscheidungen wurden erzeugt.`,
    }[locale]
  }

  const chunkDecisionSummary = normalizedSource.match(/^分片决策完成：(\d+) 片，模型处理 (\d+) 片，生成 (\d+) 个全局候选，失败 (\d+) 片。$/)
  if (chunkDecisionSummary?.[1]) {
    return {
      en: `Chunk decision complete: ${chunkDecisionSummary[1]} chunks, model processed ${chunkDecisionSummary[2]}, generated ${chunkDecisionSummary[3]} global candidates, failed ${chunkDecisionSummary[4]}.`,
      fr: `Décision par segment terminée : ${chunkDecisionSummary[1]} segments, modèle ${chunkDecisionSummary[2]}, ${chunkDecisionSummary[3]} candidats globaux générés, ${chunkDecisionSummary[4]} échecs.`,
      de: `Chunk-Entscheidung abgeschlossen: ${chunkDecisionSummary[1]} Chunks, Modell verarbeitete ${chunkDecisionSummary[2]}, ${chunkDecisionSummary[3]} globale Kandidaten erzeugt, ${chunkDecisionSummary[4]} fehlgeschlagen.`,
    }[locale]
  }

  if (normalizedSource === '刚刚最后编辑') {
    return {
      en: 'Just edited',
      fr: 'Modifié à l’instant',
      de: 'Gerade bearbeitet',
    }[locale]
  }

  const lastEditedHours = normalizedSource.match(/^(\d+)小时前最后编辑$/)
  if (lastEditedHours?.[1]) {
    return {
      en: `Last edited ${lastEditedHours[1]} hours ago`,
      fr: `Dernière modification il y a ${lastEditedHours[1]} heures`,
      de: `Zuletzt vor ${lastEditedHours[1]} Stunden bearbeitet`,
    }[locale]
  }

  const lastEditedDays = normalizedSource.match(/^(\d+)天前最后编辑$/)
  if (lastEditedDays?.[1]) {
    return {
      en: `Last edited ${lastEditedDays[1]} days ago`,
      fr: `Dernière modification il y a ${lastEditedDays[1]} jours`,
      de: `Zuletzt vor ${lastEditedDays[1]} Tagen bearbeitet`,
    }[locale]
  }

  const lastEditedWeeks = normalizedSource.match(/^(\d+)周前最后编辑$/)
  if (lastEditedWeeks?.[1]) {
    return {
      en: `Last edited ${lastEditedWeeks[1]} weeks ago`,
      fr: `Dernière modification il y a ${lastEditedWeeks[1]} semaines`,
      de: `Zuletzt vor ${lastEditedWeeks[1]} Wochen bearbeitet`,
    }[locale]
  }

  const lastEditedMonths = normalizedSource.match(/^(\d+)月前最后编辑$/)
  if (lastEditedMonths?.[1]) {
    return {
      en: `Last edited ${lastEditedMonths[1]} months ago`,
      fr: `Dernière modification il y a ${lastEditedMonths[1]} mois`,
      de: `Zuletzt vor ${lastEditedMonths[1]} Monaten bearbeitet`,
    }[locale]
  }

  const hoursAgo = normalizedSource.match(/^(\d+)小时前$/)
  if (hoursAgo?.[1]) {
    return {
      en: `${hoursAgo[1]} hours ago`,
      fr: `Il y a ${hoursAgo[1]} heures`,
      de: `Vor ${hoursAgo[1]} Stunden`,
    }[locale]
  }

  const removeVideo = normalizedSource.match(/^移除 (.+)$/)
  if (removeVideo?.[1]) {
    return {
      en: `Remove ${removeVideo[1]}`,
      fr: `Supprimer ${removeVideo[1]}`,
      de: `${removeVideo[1]} entfernen`,
    }[locale]
  }

  const previewNamedAudio = normalizedSource.match(/^试听(.+)$/)
  if (previewNamedAudio?.[1]) {
    return {
      en: `Preview ${previewNamedAudio[1]}`,
      fr: `Écouter ${previewNamedAudio[1]}`,
      de: `${previewNamedAudio[1]} anhören`,
    }[locale]
  }

  const pausePreviewNamedAudio = normalizedSource.match(/^暂停试听(.+)$/)
  if (pausePreviewNamedAudio?.[1]) {
    return {
      en: `Pause preview ${pausePreviewNamedAudio[1]}`,
      fr: `Mettre en pause ${pausePreviewNamedAudio[1]}`,
      de: `Vorschau ${pausePreviewNamedAudio[1]} pausieren`,
    }[locale]
  }

  const daysAgo = normalizedSource.match(/^(\d+)天前$/)
  if (daysAgo?.[1]) {
    return {
      en: `${daysAgo[1]} days ago`,
      fr: `Il y a ${daysAgo[1]} jours`,
      de: `Vor ${daysAgo[1]} Tagen`,
    }[locale]
  }

  return undefined
}

function translateEnglishFallbackPattern(source: string) {
  const normalizedSource = normalizeText(source)

  const notificationCount = normalizedSource.match(/^共 (\d+) 条，未读 (\d+) 条$/)
  if (notificationCount) {
    return `${notificationCount[1]} total, ${notificationCount[2]} unread`
  }

  const calibrationSummary = normalizedSource.match(/^共发现 (\d+) 个片段需要校准，总时长差异 ([\d.]+) 秒$/)
  if (calibrationSummary) {
    return `${calibrationSummary[1]} segments need calibration. Total duration difference: ${calibrationSummary[2]} seconds`
  }

  const projectShortId = normalizedSource.match(/^项目 (.+)$/)
  if (projectShortId?.[1]) {
    return `Project ${projectShortId[1]}`
  }

  const currentPeriod = normalizedSource.match(/^当前周期至 (.+)$/)
  if (currentPeriod?.[1]) {
    return `Current period ends ${currentPeriod[1]}`
  }

  const includedBonus = normalizedSource.match(/^含赠送 ([\d,]+)$/)
  if (includedBonus?.[1]) {
    return `Includes ${includedBonus[1]} bonus credits`
  }

  const monthlyIssuedCredits = normalizedSource.match(/^月付，每月发放 ([\d,]+) Credits$/)
  if (monthlyIssuedCredits?.[1]) {
    return `Monthly billing, ${monthlyIssuedCredits[1]} credits issued each month`
  }

  const segmentInvalidTimestamp = normalizedSource.match(/^片段 (\d+) 的时间戳无效$/)
  if (segmentInvalidTimestamp?.[1]) {
    return `Segment ${segmentInvalidTimestamp[1]} has an invalid timestamp`
  }

  const segmentInvalidRange = normalizedSource.match(/^片段 (\d+) 的时间范围无效，请检查开始时间和结束时间$/)
  if (segmentInvalidRange?.[1]) {
    return `Segment ${segmentInvalidRange[1]} has an invalid time range. Check the start and end times.`
  }

  const segmentMissingTts = normalizedSource.match(/^片段 (\d+) 需要 TTS 音频但未生成，请先生成所有解说音频$/)
  if (segmentMissingTts?.[1]) {
    return `Segment ${segmentMissingTts[1]} needs TTS audio, but it has not been generated. Generate all narration audio first.`
  }

  const scriptSegmentLimit = normalizedSource.match(/^脚本片段 (\d+) 段超过当前设备建议上限 (\d+) 段$/)
  if (scriptSegmentLimit?.[1]) {
    return `Script segment count ${scriptSegmentLimit[1]} exceeds the current device recommendation of ${scriptSegmentLimit[2]} segments`
  }

  const originalVideoLimit = normalizedSource.match(/^原视频 (.+) 超过当前设备建议上限 (.+)$/)
  if (originalVideoLimit?.[1]) {
    return `Original video ${originalVideoLimit[1]} exceeds the current device recommendation of ${originalVideoLimit[2]}`
  }

  const outputDurationLimit = normalizedSource.match(/^预计输出时长 (.+) 超过当前设备建议上限 (.+)$/)
  if (outputDurationLimit?.[1]) {
    return `Estimated output duration ${outputDurationLimit[1]} exceeds the current device recommendation of ${outputDurationLimit[2]}`
  }

  const stopLocalComposition = normalizedSource.match(/^为避免浏览器崩溃，已停止本地视频合成：(.+)。请拆分素材\/减少输出时长，或降低合成质量后重试。$/)
  if (stopLocalComposition?.[1]) {
    return `Local video composition was stopped to avoid a browser crash: ${stopLocalComposition[1]}. Split assets, reduce output duration, or lower composition quality and try again.`
  }

  const materialSizeLimit = normalizedSource.match(/^素材总大小 (.+) 超过当前设备建议上限 (.+)$/)
  if (materialSizeLimit?.[1]) {
    return `Total asset size ${materialSizeLimit[1]} exceeds the current device recommendation of ${materialSizeLimit[2]}`
  }

  const mergedVideoLimit = normalizedSource.match(/^合并后视频 (.+) 超过当前设备建议上限 (.+)$/)
  if (mergedVideoLimit?.[1]) {
    return `Merged video ${mergedVideoLimit[1]} exceeds the current device recommendation of ${mergedVideoLimit[2]}`
  }

  const videoDurationLimit = normalizedSource.match(/^视频时长 (.+) 超过当前设备建议上限 (.+)$/)
  if (videoDurationLimit?.[1]) {
    return `Video duration ${videoDurationLimit[1]} exceeds the current device recommendation of ${videoDurationLimit[2]}`
  }

  const stopFrameTask = normalizedSource.match(/^为避免浏览器崩溃，已停止通用模式任务：(.+)。请拆分素材或减少视频时长后重试。$/)
  if (stopFrameTask?.[1]) {
    return `General mode was stopped to avoid a browser crash: ${stopFrameTask[1]}. Split assets or reduce video duration and try again.`
  }

  const formatSeconds = normalizedSource.match(/^约 ([\d.]+) 秒$/)
  if (formatSeconds?.[1]) {
    return `About ${formatSeconds[1]} seconds`
  }

  const formatMinutes = normalizedSource.match(/^约 ([\d.]+) 分钟$/)
  if (formatMinutes?.[1]) {
    return `About ${formatMinutes[1]} minutes`
  }

  const formatHours = normalizedSource.match(/^约 ([\d.]+) 小时 ([\d.]+) 分钟$/)
  if (formatHours?.[1]) {
    return `About ${formatHours[1]} hours ${formatHours[2]} minutes`
  }

  const fileFormatBest = normalizedSource.match(/^(.+) 格式完全支持，处理效果最佳$/)
  if (fileFormatBest?.[1]) {
    return `${fileFormatBest[1]} is fully supported and works best`
  }

  const fileFormatGood = normalizedSource.match(/^(.+) 格式支持良好$/)
  if (fileFormatGood?.[1]) {
    return `${fileFormatGood[1]} is well supported`
  }

  const fileFormatLimited = normalizedSource.match(/^(.+) 格式支持有限，可能存在兼容性问题$/)
  if (fileFormatLimited?.[1]) {
    return `${fileFormatLimited[1]} has limited support and may have compatibility issues`
  }

  const fileFormatUnsupported = normalizedSource.match(/^(.+) 格式不受支持，请选择 MP4、WebM、MOV 或 AVI 格式$/)
  if (fileFormatUnsupported?.[1]) {
    return `${fileFormatUnsupported[1]} is not supported. Choose MP4, WebM, MOV, or AVI.`
  }

  const selectedVideoCount = normalizedSource.match(/^已选择 (\d+) 个视频$/)
  if (selectedVideoCount?.[1]) {
    return `${selectedVideoCount[1]} videos selected`
  }

  const uploadedVideoSummary = normalizedSource.match(/^(\d+)\/(\d+) 个视频 · 合计 (.+)$/)
  if (uploadedVideoSummary?.[1]) {
    return `${uploadedVideoSummary[1]}/${uploadedVideoSummary[2]} videos · ${uploadedVideoSummary[3]} total`
  }

  const uploadLimitDescription = normalizedSource.match(/^支持上传最多 (\d+) 个视频，合计最大 (.+)，格式支持 (.+)$/)
  if (uploadLimitDescription?.[1]) {
    return `Upload up to ${uploadLimitDescription[1]} videos, total size up to ${uploadLimitDescription[2]}. Supported formats: ${uploadLimitDescription[3]}`
  }

  const uploadCurrentTotal = normalizedSource.match(/^合计 (.+)，可继续追加，最多 (\d+) 个$/)
  if (uploadCurrentTotal?.[1]) {
    return `${uploadCurrentTotal[1]} total. You can add more, up to ${uploadCurrentTotal[2]} videos.`
  }

  const ignoredNonVideoFiles = normalizedSource.match(/^已忽略 (\d+) 个非视频文件$/)
  if (ignoredNonVideoFiles?.[1]) {
    return `Ignored ${ignoredNonVideoFiles[1]} non-video files`
  }

  const maximumVideoCount = normalizedSource.match(/^最多只能选择 (\d+) 个视频$/)
  if (maximumVideoCount?.[1]) {
    return `You can select up to ${maximumVideoCount[1]} videos`
  }

  const skippedTotalSizeLimit = normalizedSource.match(/^已跳过超出总大小上限 (.+) 的视频$/)
  if (skippedTotalSizeLimit?.[1]) {
    return `Skipped videos that exceed the total size limit of ${skippedTotalSizeLimit[1]}`
  }

  const frameStepRunningWithElapsed = normalizedSource.match(/^正在处理：(.+)，已用时 (\d+)s。$/)
  if (frameStepRunningWithElapsed?.[1]) {
    return `Processing: ${translateText(frameStepRunningWithElapsed[1], 'en')}. ${frameStepRunningWithElapsed[2]}s elapsed.`
  }

  const frameStepRunning = normalizedSource.match(/^正在处理：(.+)$/)
  if (frameStepRunning?.[1]) {
    return `Processing: ${translateText(frameStepRunning[1], 'en')}`
  }

  const countScripts = normalizedSource.match(/^(\d+) 条脚本$/)
  if (countScripts?.[1]) {
    return `${countScripts[1]} script items`
  }

  return undefined
}

export function translateText(source: string, locale: Locale): string {
  if (locale === 'zh-CN' || !source) {
    return source
  }

  const exact = dictionary[source]?.[locale] ?? dictionary[normalizeText(source)]?.[locale]
  if (exact) {
    return exact
  }

  if (locale === 'en') {
    const englishExact = englishFallbackDictionary[source] ?? englishFallbackDictionary[normalizeText(source)]
    if (englishExact) {
      return englishExact
    }
  }

  if (!hasChinese(source)) {
    return source
  }

  const patternTranslation = translatePattern(source, locale)
  if (patternTranslation) {
    return patternTranslation
  }

  if (locale === 'en') {
    const englishPatternTranslation = translateEnglishFallbackPattern(source)
    if (englishPatternTranslation) {
      return englishPatternTranslation
    }
  }

  const sources = locale === 'en'
    ? [...dictionarySources, ...englishFallbackSources].sort((a, b) => b.length - a.length)
    : dictionarySources

  const translatedText = sources.reduce((result, dictionarySource) => {
    const translated = dictionary[dictionarySource]?.[locale]
      ?? (locale === 'en' ? englishFallbackDictionary[dictionarySource] : undefined)
    return translated ? result.split(dictionarySource).join(translated) : result
  }, source)

  return hasChinese(translatedText) ? source : translatedText
}

function translateAttributes(element: Element, locale: Locale) {
  if (shouldSkipElement(element)) return

  if (element instanceof HTMLInputElement && (element.readOnly || element.disabled)) {
    const currentValue = element.value
    if (currentValue) {
      const cachedSource = inputValueOriginals.get(element)
      const cachedTranslation = cachedSource ? translateText(cachedSource, locale) : null
      const sourceValue = cachedSource && currentValue === cachedTranslation
        ? cachedSource
        : currentValue

      inputValueOriginals.set(element, sourceValue)
      const translatedValue = translateText(sourceValue, locale)
      if (currentValue !== translatedValue) {
        element.value = translatedValue
        element.setAttribute('value', translatedValue)
      }
    }
  }

  translatedAttributeNames.forEach((attributeName) => {
    const current = element.getAttribute(attributeName)
    if (!current) return

    let originals = attrOriginals.get(element)
    if (!originals) {
      originals = new Map()
      attrOriginals.set(element, originals)
    }

    let rendered = attrRendered.get(element)
    if (!rendered) {
      rendered = new Map()
      attrRendered.set(element, rendered)
    }

    // A React update is a new source value, not a stale translation to restore.
    if (!originals.has(attributeName) || current !== rendered.get(attributeName)) {
      originals.set(attributeName, current)
    }

    const original = originals.get(attributeName) ?? current
    const translated = translateText(original, locale)
    rendered.set(attributeName, translated)

    if (current !== translated) {
      element.setAttribute(attributeName, translated)
    }
  })
}

function translateNode(node: Node, locale: Locale) {
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    if (shouldSkipElement(textNode.parentElement)) return

    const current = textNode.nodeValue ?? ''
    const normalized = current.trim()
    if (!normalized) return

    if (!textNodeOriginals.has(textNode) || current !== textNodeRendered.get(textNode)) {
      textNodeOriginals.set(textNode, current)
    }

    const original = textNodeOriginals.get(textNode) ?? current
    const translated = translateText(original, locale)
    textNodeRendered.set(textNode, translated)
    if (current !== translated) {
      textNode.nodeValue = translated
    }
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return

  const element = node as Element
  translateAttributes(element, locale)
  element.childNodes.forEach((child) => translateNode(child, locale))
}

function I18nDomTranslator({ locale }: { locale: Locale }) {
  const location = useLocation()
  const isAdminPath = location.pathname.startsWith('/admin')

  useEffect(() => {
    document.documentElement.lang = locale
    localStorage.setItem(STORAGE_KEY, locale)
  }, [locale])

  useEffect(() => {
    if (isAdminPath) {
      return
    }

    let frameId = 0
    const scheduleTranslate = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => translateNode(document.body, locale))
    }

    scheduleTranslate()
    const observer = new MutationObserver(scheduleTranslate)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: translatedAttributeNames,
      characterData: true,
      childList: true,
      subtree: true,
    })

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [isAdminPath, locale, location.pathname])

  return null
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale(initialLocale))

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
  }, [])

  const t = useCallback((source: string) => translateText(source, locale), [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return (
    <I18nContext.Provider value={value}>
      <I18nDomTranslator locale={locale} />
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
