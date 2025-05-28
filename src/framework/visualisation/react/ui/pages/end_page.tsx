import { Weak } from '../../../../helpers'
import { PropsUIPageEnd } from '../../../../types/pages'
import { ReactFactoryContext } from '../../factory'
import { Page } from './templates/page'
import TextBundle from '../../../../text_bundle'
import { Translator } from '../../../../translator'
import { BodyLarge, Title1 } from '../elements/text'
import { CopyButton } from '../elements/copy_button'
import React from 'react'

type Props = Weak<PropsUIPageEnd> & ReactFactoryContext & {
  info?: string
}

export const EndPage = (props: Props): JSX.Element => {
  const { title, text, errorMessage } = prepareCopy(props)
  const { resolve, locale } = props
  const submissionId = String(props.info || window.submissionId || '')

  // Enhanced logging for submission ID tracking
  console.log('[EndPage] [SUBMISSION_TRACKING] EndPage component rendered with props:', {
    propsInfo: props.info,
    windowSubmissionId: window.submissionId,
    finalSubmissionId: submissionId,
    hasSubmissionId: !!submissionId,
    timestamp: new Date().toISOString()
  });

  // Log error if submission ID is missing
  if (!submissionId) {
    console.error('[EndPage] [SUBMISSION_TRACKING] ERROR: Submission ID is missing!');
    console.error('[EndPage] [SUBMISSION_TRACKING] Props.info:', props.info);
    console.error('[EndPage] [SUBMISSION_TRACKING] window.submissionId:', window.submissionId);
    console.error('[EndPage] [SUBMISSION_TRACKING] This indicates the donation process may not have completed successfully');
  } else {
    console.log('[EndPage] [SUBMISSION_TRACKING] SUCCESS: Submission ID found:', submissionId);
  }

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
      {submissionId ? (
        <div className="mt-6">
          <CopyButton 
            textToCopy={submissionId} 
            locale={locale} 
          />
        </div>
      ) : (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <BodyLarge text={errorMessage} color="text-red-600" />
        </div>
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
  errorMessage: string
}

function prepareCopy ({ locale }: Props): Copy {
  return {
    title: Translator.translate(title, locale),
    text: Translator.translate(text, locale),
    errorMessage: Translator.translate(errorMessage, locale)
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

const errorMessage = new TextBundle()
  .add('en', 'Error: Submission ID is missing. Please contact support.')
  .add('de', 'Fehler: Einreichungs-ID fehlt. Bitte versuchen Sie, Ihre Daten erneut zu übermitteln.')
  .add('nl', 'Fout: Inzending-ID ontbreekt. Probeer uw gegevens opnieuw in te dienen.')
