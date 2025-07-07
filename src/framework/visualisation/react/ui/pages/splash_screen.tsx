import React from 'react'
import { Weak } from '../../../../helpers'
import TextBundle from '../../../../text_bundle'
import { Translator } from '../../../../translator'
import { PropsUIPageSplashScreen } from '../../../../types/pages'
import { ReactFactoryContext } from '../../factory'
import { PrimaryButton } from '../elements/button'
import { CheckBox } from '../elements/check_box'
import { Label, Title1 } from '../elements/text'
import LogoSvg from '../../../../../assets/images/logo.svg'
// import { Footer } from './templates/footer'
import { Page } from './templates/page'
// import { Sidebar } from './templates/sidebar'
import { Bullet } from '../elements/bullet'

interface Copy {
  title: string
  continueButton: string
  privacyLabel: string
}

type Props = Weak<PropsUIPageSplashScreen> & ReactFactoryContext

function prepareCopy ({ locale, platform }: Props): Copy {
  return {
    title: Translator.translate(getTitleForPlatform(platform), locale),
    continueButton: Translator.translate(continueButton, locale),
    privacyLabel: Translator.translate(privacyLabel, locale)
  }
}

// Function to get the appropriate TextBundle for the title based on platform
function getTitleForPlatform(platform: string): TextBundle {
  switch (platform?.toLowerCase()) {
    case 'instagram':
      return instagramTitle
    case 'facebook':
      return facebookTitle
    case 'twitter':
    case 'x':
      return twitterTitle
    case 'activitywatch':
      return activityWatchTitle
    case 'tiktok':
    default:
      return tiktokTitle
  }
}

export const SplashScreen = (props: Props): JSX.Element => {
  const [checked, setChecked] = React.useState<boolean>(false)
  const [waiting, setWaiting] = React.useState<boolean>(false)
  const { title, continueButton, privacyLabel } = prepareCopy(props)
  const { locale, platform, resolve } = props

  function handleContinue (): void {
    if (checked && !waiting) {
      console.debug('[SplashScreen] User clicked Start button with platform:', platform)
      setWaiting(true)
      
      // Create a loading indicator timeout to ensure the spinner stops if the response doesn't cause a UI update
      const resetSpinnerTimeout = setTimeout(() => {
        console.debug('[SplashScreen] Automatically resetting spinner state after timeout')
        setWaiting(false)
      }, 3000); // Reset spinner after 3 seconds if no UI update occurs
      
      // Call resolve with the payload
      resolve?.({ 
        __type__: 'PayloadVoid', 
        value: undefined 
      })
      
      // Immediately reset spinner after sending - the UI will have moved to a new page by then
      setTimeout(() => {
        clearTimeout(resetSpinnerTimeout);
        setWaiting(false);
      }, 500);
    } else {
      console.debug('[SplashScreen] Start button clicked but conditions not met - checked:', checked, 'waiting:', waiting)
    }
  }

  function handleCheck (): void {
    if (!checked && !waiting) {
      console.debug('[SplashScreen] User checked consent checkbox')
      setChecked(true)
    }
  }

  function renderDescription (): JSX.Element {
    // First determine which platform to show
    const platformContent = getPlatformContent(platform, locale)
    
    // Then determine which language to use
    if (locale === 'nl') return platformContent.nl
    return platformContent.en
  }
  
  // Helper function to get platform-specific content
  function getPlatformContent(platform: string, locale: string) {
    switch (platform?.toLowerCase()) {
      case 'instagram':
        return { en: instagramEnDescription, nl: instagramNlDescription }
      case 'facebook':
        return { en: facebookEnDescription, nl: facebookNlDescription }
      case 'twitter':
      case 'x':
        return { en: twitterEnDescription, nl: twitterNlDescription }
      case 'activitywatch':
        return { en: activityWatchEnDescription, nl: activityWatchNlDescription }
      case 'tiktok':
      default:
        return { en: tiktokEnDescription, nl: tiktokNlDescription }
    }
  }

  // Rename existing descriptions to be TikTok-specific
  const tiktokEnDescription: JSX.Element = (
    <>
    <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
            You are about to start the process of donating your TikTok data to our University of Oxford study. The data that we ask you to donate will be used for academic research to gain insight into how platforms work.
        </div>
        <div className='mb-4'></div>
            We will walk you through this process step by step. During this process no data is stored or sent to a server. You can delete rows from the data before donating. Data will only be donated and stored when you click the button "Yes, donate" on the page that shows your data.
        </div>
        <div className='mb-6'>
            By clicking the button "<span className='font-bodybold'>Yes, donate</span>":
        </div>
        <div className='flex flex-col gap-3 mb-6'>
            <Bullet>
                <div>you fully and voluntarily agree to donate your data for this research.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that when your data is used for academic publications, or made publicly available in some other form, this will be anonymous.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that you have the right to withdraw your permission.</div>
            </Bullet>
        </div>
        </>
  )

  const tiktokNlDescription: JSX.Element = (
    <>
      <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
          U kunt zo uw gegevens gaan doneren voor een onderzoek van een onderzoeksinstituut. De gegevens die we u vragen te doneren worden gebruikt voor wetenschappelijke onderzoek om inzicht te krijgen in de werkwijze van sociale media.
        </div>
        <div className='mb-4'>
          We leggen u stap voor stap wat er van u verwacht wordt. Tijdens deze stappen worden geen gegevens opgeslagen of naar een server verstuurd. U kunt zelf rijen uit uw data verwijderen die u niet wilt doneren. Pas als u de vraag krijgt of u de gegevens wilt doneren en u op de knop "<span className='font-bodybold'>Ja, doneer</span>" klikt, worden de gegevens gedoneerd en opgeslagen.
        </div>
        <div className='mb-4'>
          Door op de knop "<span className='font-bodybold'>Ja, doneer</span>" te klikken:
        </div>
        <div className='flex flex-col gap-3 mb-6'>
          <Bullet>
            <div>Geeft u volledig en vrijwillig toestemming om uw data te doneren voor dit onderzoek.'</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat als uw gegevens worden gebruikt in wetenschappelijke publicaties, of deze op een andere manier openbaar worden gemaakt, dit dan anoniem gebeurt.</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat u het recht hebt om uw toestemming binnen in te trekken.</div>
          </Bullet>
        </div>
        <div className='mb-10'>
          Deze website houdt ook uw activiteiten bij – bijvoorbeeld op welke pagina's van deze website u klikt – als deel van dit onderzoek. U kunt meer informatie op onze privacy pagina vinden.
        </div>
      </div>
    </>
  )

  // Add new descriptions for Instagram
  const instagramEnDescription: JSX.Element = (
    <>
    <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
            You are about to start the process of donating your Instagram data to our University of Oxford study. The data that we ask you to donate will be used for academic research to gain insight into how platforms work.
        </div>
        <div className='mb-4'></div>
            We will walk you through this process step by step. During this process no data is stored or sent to a server. You can delete rows from the data before donating. Data will only be donated and stored when you click the button "Yes, donate" on the page that shows your data.
        </div>
        <div className='mb-6'>
            By clicking the button "<span className='font-bodybold'>Yes, donate</span>":
        </div>
        <div className='flex flex-col gap-3 mb-6'>
            <Bullet>
                <div>you fully and voluntarily agree to donate your data for this research.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that when your data is used for academic publications, or made publicly available in some other form, this will be anonymous.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that you have the right to withdraw your permission.</div>
            </Bullet>
        </div>
        </>
  )

  const instagramNlDescription: JSX.Element = (
    <>
      <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
          U kunt zo uw Instagram gegevens gaan doneren voor een onderzoek van een onderzoeksinstituut. De gegevens die we u vragen te doneren worden gebruikt voor wetenschappelijke onderzoek om inzicht te krijgen in de werkwijze van sociale media.
        </div>
        <div className='mb-4'>
          We leggen u stap voor stap wat er van u verwacht wordt. Tijdens deze stappen worden geen gegevens opgeslagen of naar een server verstuurd. U kunt zelf rijen uit uw data verwijderen die u niet wilt doneren. Pas als u de vraag krijgt of u de gegevens wilt doneren en u op de knop "<span className='font-bodybold'>Ja, doneer</span>" klikt, worden de gegevens gedoneerd en opgeslagen.
        </div>
        <div className='mb-4'>
          Door op de knop "<span className='font-bodybold'>Ja, doneer</span>" te klikken:
        </div>
        <div className='flex flex-col gap-3 mb-6'>
          <Bullet>
            <div>Geeft u volledig en vrijwillig toestemming om uw data te doneren voor dit onderzoek.'</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat als uw gegevens worden gebruikt in wetenschappelijke publicaties, of deze op een andere manier openbaar worden gemaakt, dit dan anoniem gebeurt.</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat u het recht hebt om uw toestemming binnen in te trekken.</div>
          </Bullet>
        </div>
        <div className='mb-10'>
          Deze website houdt ook uw activiteiten bij – bijvoorbeeld op welke pagina's van deze website u klikt – als deel van dit onderzoek. U kunt meer informatie op onze privacy pagina vinden.
        </div>
      </div>
    </>
  )

  // Add descriptions for Facebook
  const facebookEnDescription: JSX.Element = (
    <>
    <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
            You are about to start the process of donating your Facebook data to our University of Oxford study. The data that we ask you to donate will be used for academic research to gain insight into how platforms work.
        </div>
        <div className='mb-4'></div>
            We will walk you through this process step by step. During this process no data is stored or sent to a server. You can delete rows from the data before donating. Data will only be donated and stored when you click the button "Yes, donate" on the page that shows your data.
        </div>
        <div className='mb-6'>
            By clicking the button "<span className='font-bodybold'>Yes, donate</span>":
        </div>
        <div className='flex flex-col gap-3 mb-6'>
            <Bullet>
                <div>you fully and voluntarily agree to donate your data for this research.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that when your data is used for academic publications, or made publicly available in some other form, this will be anonymous.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that you have the right to withdraw your permission.</div>
            </Bullet>
        </div>
        </>
  )

  const facebookNlDescription: JSX.Element = (
    <>
      <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
          U kunt zo uw Facebook gegevens gaan doneren voor een onderzoek van een onderzoeksinstituut. De gegevens die we u vragen te doneren worden gebruikt voor wetenschappelijke onderzoek om inzicht te krijgen in de werkwijze van sociale media.
        </div>
        <div className='mb-4'>
          We leggen u stap voor stap wat er van u verwacht wordt. Tijdens deze stappen worden geen gegevens opgeslagen of naar een server verstuurd. U kunt zelf rijen uit uw data verwijderen die u niet wilt doneren. Pas als u de vraag krijgt of u de gegevens wilt doneren en u op de knop "<span className='font-bodybold'>Ja, doneer</span>" klikt, worden de gegevens gedoneerd en opgeslagen.
        </div>
        <div className='mb-4'>
          Door op de knop "<span className='font-bodybold'>Ja, doneer</span>" te klikken:
        </div>
        <div className='flex flex-col gap-3 mb-6'>
          <Bullet>
            <div>Geeft u volledig en vrijwillig toestemming om uw data te doneren voor dit onderzoek.'</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat als uw gegevens worden gebruikt in wetenschappelijke publicaties, of deze op een andere manier openbaar worden gemaakt, dit dan anoniem gebeurt.</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat u het recht hebt om uw toestemming binnen in te trekken.</div>
          </Bullet>
        </div>
        <div className='mb-10'>
          Deze website houdt ook uw activiteiten bij – bijvoorbeeld op welke pagina's van deze website u klikt – als deel van dit onderzoek. U kunt meer informatie op onze privacy pagina vinden.
        </div>
      </div>
    </>
  )

  // Add descriptions for Twitter/X
  const twitterEnDescription: JSX.Element = (
    <>
    <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
            You are about to start the process of donating your Twitter/X data to our University of Oxford study. The data that we ask you to donate will be used for academic research to gain insight into how platforms work.
        </div>
        <div className='mb-4'></div>
            We will walk you through this process step by step. During this process no data is stored or sent to a server. You can delete rows from the data before donating. Data will only be donated and stored when you click the button "Yes, donate" on the page that shows your data.
        </div>
        <div className='mb-6'>
            By clicking the button "<span className='font-bodybold'>Yes, donate</span>":
        </div>
        <div className='flex flex-col gap-3 mb-6'>
            <Bullet>
                <div>you fully and voluntarily agree to donate your data for this research.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that when your data is used for academic publications, or made publicly available in some other form, this will be anonymous.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that you have the right to withdraw your permission.</div>
            </Bullet>
        </div>
        </>
  )

  const twitterNlDescription: JSX.Element = (
    <>
      <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
          U kunt zo uw Twitter/X gegevens gaan doneren voor een onderzoek van een onderzoeksinstituut. De gegevens die we u vragen te doneren worden gebruikt voor wetenschappelijke onderzoek om inzicht te krijgen in de werkwijze van sociale media.
        </div>
        <div className='mb-4'>
          We leggen u stap voor stap wat er van u verwacht wordt. Tijdens deze stappen worden geen gegevens opgeslagen of naar een server verstuurd. U kunt zelf rijen uit uw data verwijderen die u niet wilt doneren. Pas als u de vraag krijgt of u de gegevens wilt doneren en u op de knop "<span className='font-bodybold'>Ja, doneer</span>" klikt, worden de gegevens gedoneerd en opgeslagen.
        </div>
        <div className='mb-4'>
          Door op de knop "<span className='font-bodybold'>Ja, doneer</span>" te klikken:
        </div>
        <div className='flex flex-col gap-3 mb-6'>
          <Bullet>
            <div>Geeft u volledig en vrijwillig toestemming om uw data te doneren voor dit onderzoek.'</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat als uw gegevens worden gebruikt in wetenschappelijke publicaties, of deze op een andere manier openbaar worden gemaakt, dit dan anoniem gebeurt.</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat u het recht hebt om uw toestemming binnen in te trekken.</div>
          </Bullet>
        </div>
        <div className='mb-10'>
          Deze website houdt ook uw activiteiten bij – bijvoorbeeld op welke pagina's van deze website u klikt – als deel van dit onderzoek. U kunt meer informatie op onze privacy pagina vinden.
        </div>
      </div>
    </>
  )

  // Add descriptions for ActivityWatch
  const activityWatchEnDescription: JSX.Element = (
    <>
    <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
            You are about to start the process of donating your ActivityWatch data to our University of Oxford study. The data that we ask you to donate will be used for academic research to gain insight into how platforms work.
        </div>
        <div className='mb-4'></div>
            We will walk you through this process step by step. During this process no data is stored or sent to a server. You can delete rows from the data before donating. Data will only be donated and stored when you click the button "Yes, donate" on the page that shows your data.
        </div>
        <div className='mb-6'>
            By clicking the button "<span className='font-bodybold'>Yes, donate</span>":
        </div>
        <div className='flex flex-col gap-3 mb-6'>
            <Bullet>
                <div>you fully and voluntarily agree to donate your data for this research.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that when your data is used for academic publications, or made publicly available in some other form, this will be anonymous.</div>
            </Bullet>
            <Bullet>
                <div>you are aware that you have the right to withdraw your permission.</div>
            </Bullet>
        </div>
        </>
  )

  const activityWatchNlDescription: JSX.Element = (
    <>
      <div className='text-bodylarge font-body text-grey1'>
        <div className='mb-4'>
          U kunt zo uw ActivityWatch gegevens gaan doneren voor een onderzoek van een onderzoeksinstituut. De gegevens die we u vragen te doneren worden gebruikt voor wetenschappelijke onderzoek om inzicht te krijgen in de werkwijze van sociale media.
        </div>
        <div className='mb-4'>
          We leggen u stap voor stap wat er van u verwacht wordt. Tijdens deze stappen worden geen gegevens opgeslagen of naar een server verstuurd. U kunt zelf rijen uit uw data verwijderen die u niet wilt doneren. Pas als u de vraag krijgt of u de gegevens wilt doneren en u op de knop "<span className='font-bodybold'>Ja, doneer</span>" klikt, worden de gegevens gedoneerd en opgeslagen.
        </div>
        <div className='mb-4'>
          Door op de knop "<span className='font-bodybold'>Ja, doneer</span>" te klikken:
        </div>
        <div className='flex flex-col gap-3 mb-6'>
          <Bullet>
            <div>Geeft u volledig en vrijwillig toestemming om uw data te doneren voor dit onderzoek.'</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat als uw gegevens worden gebruikt in wetenschappelijke publicaties, of deze op een andere manier openbaar worden gemaakt, dit dan anoniem gebeurt.</div>
          </Bullet>
          <Bullet>
            <div>Geeft u aan te weten dat u het recht hebt om uw toestemming binnen in te trekken.</div>
          </Bullet>
        </div>
        <div className='mb-10'>
          Deze website houdt ook uw activiteiten bij – bijvoorbeeld op welke pagina's van deze website u klikt – als deel van dit onderzoek. U kunt meer informatie op onze privacy pagina vinden.
        </div>
      </div>
    </>
  )

//   const footer: JSX.Element = <Footer />

//   const sidebar: JS.Element = <Sidebar logo={LogoSvg} />

  const body: JSX.Element = (
    <>
      <Title1 text={title} />
      {renderDescription()}
      <div className='flex flex-col gap-8'>
        <div className='flex flex-row gap-4 items-center'>
          <CheckBox id='0' selected={checked} onSelect={() => handleCheck()} />
          <Label text={privacyLabel} />
        </div>
        <div className={`flex flex-row gap-4 ${checked ? '' : 'opacity-30'}`}>
          <PrimaryButton label={continueButton} onClick={handleContinue} enabled={checked} spinning={waiting} />
        </div>
      </div>
    </>
  )

  return (
    <Page
      body={body}
    //   sidebar={sidebar}
    //   footer={footer}
    />
  )
}

// Update title TextBundles for different platforms
const tiktokTitle = new TextBundle()
  .add('en', 'Oxford TikTok Study')
  .add('nl', 'Welkom bij TikTok Onderzoek')

const instagramTitle = new TextBundle()
  .add('en', 'Oxford Instagram Study')
  .add('nl', 'Welkom bij Instagram Onderzoek')

const facebookTitle = new TextBundle()
  .add('en', 'Oxford Facebook Study')
  .add('nl', 'Welkom bij Facebook Onderzoek')

const twitterTitle = new TextBundle()
  .add('en', 'Oxford Twitter/X Study')
  .add('nl', 'Welkom bij Twitter/X Onderzoek')

const activityWatchTitle = new TextBundle()
  .add('en', 'Oxford ActivityWatch Study')
  .add('nl', 'Welkom bij ActivityWatch Onderzoek')

// Keep the existing continueButton and privacyLabel TextBundles
const continueButton = new TextBundle()
  .add('en', 'Yes, donate')
  .add('nl', 'Ja, doneer')

const privacyLabel = new TextBundle()
  .add('en', 'I have read and agree with the above terms.')
  .add('nl', 'Ik heb deze voorwaarden gelezen en ben hiermee akkoord.')