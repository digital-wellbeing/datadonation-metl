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
  const { title, text, errorMessage, submissionIssueTitle, submissionIssueText } = prepareCopy(props)
  const { resolve, locale, donated } = props
  const submissionId = String(window.submissionId || props.info || '')
  
  // Use React state to track submission error changes
  const [submissionError, setSubmissionError] = React.useState(window.submissionError)

  // Enhanced logging for submission ID tracking
  console.log('[EndPage] [SUBMISSION_TRACKING] EndPage component rendered with props:', {
    propsInfo: props.info,
    windowSubmissionId: window.submissionId,
    finalSubmissionId: submissionId,
    hasSubmissionId: !!submissionId,
    donated: donated,
    submissionError: submissionError,
    timestamp: new Date().toISOString()
  });

  // Log error if submission ID is missing but user donated
  if (!submissionId && donated) {
    console.error('[EndPage] [SUBMISSION_TRACKING] ERROR: Submission ID is missing but user donated!');
    console.error('[EndPage] [SUBMISSION_TRACKING] Props.info:', props.info);
    console.error('[EndPage] [SUBMISSION_TRACKING] window.submissionId:', window.submissionId);
    console.error('[EndPage] [SUBMISSION_TRACKING] This indicates the donation process may not have completed successfully');
  } else if (submissionId && donated) {
    console.log('[EndPage] [SUBMISSION_TRACKING] SUCCESS: Submission ID found and user donated:', submissionId);
  } else if (!donated) {
    console.log('[EndPage] [SUBMISSION_TRACKING] User declined donation, submission ID not needed');
  }

  // Monitor window.submissionError changes
  React.useEffect(() => {
    const checkForError = () => {
      if (window.submissionError !== submissionError) {
        console.log('[EndPage] [ERROR_TRACKING] Submission error detected:', window.submissionError);
        setSubmissionError(window.submissionError);
      }
    };
    
    // Check immediately
    checkForError();
    
    // Set up interval to check for changes
    const interval = setInterval(checkForError, 100);
    
    return () => clearInterval(interval);
  }, [submissionError]);

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
      {donated && submissionError ? (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <Title1 text={submissionIssueTitle} color="text-red-600" />
          <BodyLarge text={submissionIssueText} color="text-red-600" />
          <div className="mt-4 p-3 bg-red-100 border border-red-300 rounded font-mono text-sm">
            <div><strong>Database Error:</strong></div>
            <div>{submissionError.message}</div>
            <div className="mt-2"><strong>Timestamp:</strong> {submissionError.timestamp}</div>
          </div>
        </div>
      ) : donated && submissionId ? (
        <div className="mt-6">
          <CopyButton 
            textToCopy={submissionId} 
            locale={locale} 
          />
        </div>
      ) : donated && !submissionId ? (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <BodyLarge text={errorMessage} color="text-red-600" />
        </div>
      ) : null}
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
  submissionIssueTitle: string
  submissionIssueText: string
}

function prepareCopy ({ locale }: Props): Copy {
  return {
    title: Translator.translate(title, locale),
    text: Translator.translate(text, locale),
    errorMessage: Translator.translate(errorMessage, locale),
    submissionIssueTitle: Translator.translate(submissionIssueTitle, locale),
    submissionIssueText: Translator.translate(submissionIssueText, locale)
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

const submissionIssueTitle = new TextBundle()
  .add('en', 'Submission Issue')
  .add('de', 'Einreichungsproblem')
  .add('nl', 'Inzendingsprobleem')

const submissionIssueText = new TextBundle()
  .add('en', 'There was an issue processing your data donation. The data may not have been saved properly. Please contact the researchers for assistance.')
  .add('de', 'Es gab ein Problem bei der Verarbeitung Ihrer Datenspende. Die Daten wurden möglicherweise nicht ordnungsgemäß gespeichert. Bitte wenden Sie sich an die Forscher für Unterstützung.')
  .add('nl', 'Er was een probleem bij het verwerken van uw gegevensspende. De gegevens zijn mogelijk niet correct opgeslagen. Neem contact op met de onderzoekers voor hulp.')
