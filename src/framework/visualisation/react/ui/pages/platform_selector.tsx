import React from 'react'
import { Weak } from '../../../../helpers'
import { ReactFactoryContext } from '../../factory'
import { Page } from './templates/page'
import LogoSvg from '../../../../../assets/images/logo.svg'
import { Title1 } from '../elements/text'
import { Translator } from '../../../../translator'
import TextBundle from '../../../../text_bundle'
import { useNavigate } from 'react-router-dom'

// Define text bundles for translations
const titleText = new TextBundle().add('en', 'Welcome to Data Donation').add('nl', 'Welkom bij Data Donatie')
const subtitleText = new TextBundle().add('en', 'Choose a platform to donate your data from').add('nl', 'Kies een platform om je data van te doneren')
const tiktokText = new TextBundle().add('en', 'TikTok').add('nl', 'TikTok')
const activityWatchText = new TextBundle().add('en', 'ActivityWatch').add('nl', 'ActivityWatch')

interface Copy {
  title: string
  subtitle: string
  tiktok: string
  activityWatch: string
}

type Props = Weak<ReactFactoryContext>

function prepareCopy(locale: string): Copy {
  const titleText = new TextBundle().add('en', 'Choose your platform').add('nl', 'Kies je platform')
  return {
    title: Translator.translate(titleText, locale),
    subtitle: Translator.translate(subtitleText, locale),
    tiktok: Translator.translate(tiktokText, locale),
    activityWatch: Translator.translate(activityWatchText, locale)
  }
}

export const PlatformSelector = ({ locale, resolve }: ReactFactoryContext): JSX.Element => {
  const { title, subtitle } = prepareCopy(locale)
  const navigate = useNavigate()

  const handlePlatformSelect = (platform: string) => {
    // Update the URL directly with the platform
    const platformLower = platform.toLowerCase();
    navigate(`/${platformLower}`)
    
    // Also call the resolve function to maintain backward compatibility
    if (resolve) {
      resolve({ __type__: 'PayloadString', value: platform })
    }
  }

  const body = (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <img
            className="mx-auto h-20"
            src={LogoSvg}
            alt="Logo"
          />
        </div>
        
        <p className="text-gray-600 text-center mb-8 text-lg">
          {subtitle}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handlePlatformSelect('TikTok')}
            className="flex items-center justify-center px-4 py-3 border border-gray-300 shadow-sm text-gray-900 bg-white rounded-md hover:border-blue-500 hover:shadow-md transition-all"
          >
            TikTok
          </button>
          <button
            onClick={() => handlePlatformSelect('ActivityWatch')}
            className="flex items-center justify-center px-4 py-3 border border-gray-300 shadow-sm text-gray-900 bg-white rounded-md hover:border-blue-500 hover:shadow-md transition-all"
          >
            ActivityWatch
          </button>
        </div>
      </div>
    </div>
  )

  return <Page body={body} />
} 