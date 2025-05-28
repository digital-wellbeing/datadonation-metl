import { Weak } from '../../../../helpers'
import * as React from 'react'
import { Translatable } from '../../../../types/elements'
import TextBundle from '../../../../text_bundle'
import { Translator } from '../../../../translator'
import { ReactFactoryContext } from '../../factory'
import { PropsUIPromptFileInput } from '../../../../types/prompts'
import { PrimaryButton } from '../elements/button'
import { BodyLarge, BodySmall } from '../elements/text'

type Props = Weak<PropsUIPromptFileInput> & ReactFactoryContext

export const FileInput = (props: Props): JSX.Element => {
  const [file, setFile] = React.useState<File | null>(null)
  const [waiting, setWaiting] = React.useState<boolean>(false)
  const { description, note, placeholder, extensions, selectButton, continueButton } = prepareCopy(props)
  const { resolve } = props

  function handleClick (): void {
    console.debug('[FileInput] User clicked file input button')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = extensions ?? '*'
    input.onchange = (event) => handleSelect(event)
    input.click()
  }

  function handleSelect (event: Event): void {
    const target = event.target as HTMLInputElement
    const files = target.files
    if (files !== null && files.length > 0) {
      const selected = files[0]
      console.debug('[FileInput] User selected file:', selected.name)
      setFile(selected)
    }
  }

  function handleConfirm (): void {
    if (file !== null && !waiting) {
      console.debug('[FileInput] User confirmed file selection:', file.name)
      setWaiting(true)
      resolve?.({ __type__: 'PayloadFile', value: file })
    }
  }

  return (
    <>
      <div id='select-panel'>
        <div className='flex-wrap text-bodylarge font-body text-grey1 text-left'>
          {description}
        </div>
        <div className='mt-8' />
        <div className='p-6 border-grey4 border-2 rounded'>
          <div className='flex flex-row gap-4 items-center'>
            <BodyLarge text={file?.name ?? placeholder} margin='' color={file === null ? 'text-grey2' : 'textgrey1'} />
            <div className='flex-grow' />
            <PrimaryButton onClick={handleClick} label={selectButton} color='bg-tertiary text-grey1' />
          </div>
        </div>
        <div className='mt-4' />
        <div className={`${file === null ? 'opacity-30' : 'opacity-100'}`}>
          <BodySmall text={note} margin='' />
          <div className='mt-8' />
          <div className='flex flex-row gap-4'>
            <PrimaryButton label={continueButton} onClick={handleConfirm} enabled={file !== null} spinning={waiting} />
          </div>
        </div>
      </div>
    </>
  )
}

interface Copy {
  description: string
  note: string
  placeholder: string
  extensions: string
  selectButton: string
  continueButton: string
}

function prepareCopy ({ description, extensions, locale }: Props): Copy {
  return {
    description: Translator.translate(description, locale),
    note: Translator.translate(note(), locale),
    placeholder: Translator.translate(placeholder(), locale),
    extensions: extensions,
    selectButton: Translator.translate(selectButtonLabel(), locale),
    continueButton: Translator.translate(continueButtonLabel(), locale)
  }
}

const continueButtonLabel = (): Translatable => {
  return new TextBundle()
    .add('en', 'Continue')
    .add('de', 'Weiter')
    .add('nl', 'Verder')
}

const selectButtonLabel = (): Translatable => {
  return new TextBundle()
    .add('en', 'Choose file')
    .add('de', 'Datei auswählen')
    .add('nl', 'Kies bestand')
}

const note = (): Translatable => {
  return new TextBundle()
    .add('en', 'Note: The process to extract the correct data from the file is done on your own computer. No data is stored or sent yet.')
    .add('de', 'Anmerkung: Die weitere Verarbeitung der Datei erfolgt auf Ihrem eigenen Endgerät. Es werden noch keine Daten gespeichert oder weiter gesendet.')
    .add('nl', 'NB: Het proces om de juiste gegevens uit het bestand te halen gebeurt op uw eigen computer. Er worden nog geen gegevens opgeslagen of verstuurd.')
}

const placeholder = (): Translatable => {
  return new TextBundle()
    .add('en', 'Choose a file')
    .add('de', 'Eine Datei auswählen')
    .add('nl', 'Kies een bestand')
}
