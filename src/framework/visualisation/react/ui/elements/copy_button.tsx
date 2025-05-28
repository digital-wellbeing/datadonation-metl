import React, { useState } from 'react'
import { Translator } from '../../../../translator'
import TextBundle from '../../../../text_bundle'
import CopySvg from '../../../../../assets/images/copy.svg'
import CheckmarkSvg from '../../../../../assets/images/checkmark.svg'

interface Props {
  textToCopy: string
  locale: string
  label?: string
}

export const CopyButton = ({ textToCopy, locale, label }: Props): JSX.Element => {
  const [copied, setCopied] = useState(false)
  const { copyText, copiedText, submissionIdLabel } = prepareCopy(locale)

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      
      // Reset after 2 seconds
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const uniqueId = `copy-input-${Math.random().toString(36).substr(2, 9)}`

  return (
    <div className="w-full max-w-md">
      <label htmlFor={uniqueId} className="block text-bodysmall font-medium text-grey1 mb-2">
        {label || submissionIdLabel}
      </label>
      <div className="relative">
        <input
          id={uniqueId}
          type="text"
          className="bg-grey6 border border-grey4 text-grey2 text-bodysmall rounded-lg focus:ring-primary focus:border-primary block w-full px-2.5 py-3 pr-20 font-mono"
          value={textToCopy}
          disabled
          readOnly
        />
        <button
          onClick={handleCopy}
          className="absolute end-2.5 top-1/2 -translate-y-1/2 text-grey2 hover:bg-grey5 hover:text-grey1 rounded-lg py-2 px-2.5 inline-flex items-center justify-center bg-white border-grey4 border h-8 transition-all duration-200"
          aria-label={copied ? copiedText : copyText}
        >
          {!copied ? (
            <span className="inline-flex items-center">
              <img src={CopySvg} alt="" className="w-3 h-3 me-1.5" />
              <span className="text-xs font-medium">{copyText}</span>
            </span>
          ) : (
            <span className="inline-flex items-center">
              <img src={CheckmarkSvg} alt="" className="w-3 h-3 me-1.5 text-primary" />
              <span className="text-xs font-medium text-primary">{copiedText}</span>
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

interface Copy {
  copyText: string
  copiedText: string
  submissionIdLabel: string
}

function prepareCopy(locale: string): Copy {
  return {
    copyText: Translator.translate(copyTextBundle, locale),
    copiedText: Translator.translate(copiedTextBundle, locale),
    submissionIdLabel: Translator.translate(submissionIdLabelBundle, locale)
  }
}

const copyTextBundle = new TextBundle()
  .add('en', 'Copy')
  .add('de', 'Kopieren')
  .add('nl', 'Kopiëren')

const copiedTextBundle = new TextBundle()
  .add('en', 'Copied')
  .add('de', 'Kopiert')
  .add('nl', 'Gekopieerd')

const submissionIdLabelBundle = new TextBundle()
  .add('en', 'Submission ID')
  .add('de', 'Einreichungs-ID')
  .add('nl', 'Inzending ID') 