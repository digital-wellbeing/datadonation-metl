import { Weak } from '../../../../helpers'
import { PropsUIPageEnd } from '../../../../types/pages'
import { ReactFactoryContext } from '../../factory'
import { Page } from './templates/page'
import TextBundle from '../../../../text_bundle'
import { Translator } from '../../../../translator'
import { BodyLarge, Title1 } from '../elements/text'
import React from 'react'

type Props = Weak<PropsUIPageEnd> & ReactFactoryContext & {
  info?: string
}

export const EndPage = (props: Props): JSX.Element => {
  const { title, text, submissionId } = prepareCopy(props)
  const { resolve } = props

  // Resolve with PayloadVoid when component mounts
  React.useEffect(() => {
    if (resolve) {
      resolve({ __type__: 'PayloadVoid', value: undefined })
    }
  }, [resolve])

  const body: JSX.Element = (
    <>
      <Title1 text={title} />
      <BodyLarge text={text} />
      {(submissionId || window.submissionId) && (
        <BodyLarge text={`Submission ID: ${submissionId || window.submissionId}`} color="text-grey2" />
      )}
    </>
  )

  return (
    <Page
      body={body}
    />
  )
}

interface Copy {
  title: string
  text: string
  submissionId?: string
}

function prepareCopy ({ locale, info }: Props): Copy {
  const translatedText = Translator.translate(text, locale)
  return {
    title: Translator.translate(title, locale),
    text: translatedText.replace('{submissionId}', info || 'not available'),
    submissionId: info
  }
}

const title = new TextBundle()
  .add('en', 'Thank you')
  .add('de', 'Danke')
  .add('nl', 'Bedankt')

const text = new TextBundle()
  .add('en', 'Thank you for your participation. You can now close the page or refresh to restart the donation flow.')
  .add('de', 'Herzlichen Dank für Ihre Teilnahme. Sie können diese Seite nun schließen oder die Seite aktualisieren, um die Datenspende erneut durchzuführen.')
  .add('nl', 'Hartelijk dank voor uw deelname. U kunt deze pagina nu sluiten of de pagina verversen om de flow nogmaals te doorlopen.')
