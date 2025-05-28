import { EndPage } from './ui/pages/end_page'
import { 
  isPropsUIPageEnd, 
  isPropsUIPageDonation, 
  PropsUIPage, 
  isPropsUIPageSplashScreen, 
  isPropsUIPagePlatformSelector,
  isPropsUIPageWrapper
} from '../../types/pages'
import { DonationPage } from './ui/pages/donation_page'
import { Payload } from '../../types/commands'
import { SplashScreen } from './ui/pages/splash_screen'
import { PlatformSelector } from './ui/pages/platform_selector'
// import { ErrorPage } from './ui/pages/error_page'
import React from 'react'

export interface ReactFactoryContext {
  locale: string
  resolve?: (payload: Payload) => void
}

export default class ReactFactory {
  createPage (page: PropsUIPage, context: ReactFactoryContext): JSX.Element {
    // Handle direct component wrapping if provided
    if (isPropsUIPageWrapper(page)) {
      return <React.Fragment>{page.component}</React.Fragment>
    }
    
    if (isPropsUIPagePlatformSelector(page)) {
      return <PlatformSelector {...context} />
    }
    if (isPropsUIPageSplashScreen(page)) {
      return <SplashScreen {...page} {...context} />
    }
    if (isPropsUIPageEnd(page)) {
      return <EndPage {...page} {...context} />
    }
    if (isPropsUIPageDonation(page)) {
      return <DonationPage {...page} {...context} />
    }
    // if (isPropsUIPageError(page)) {
    //   return <ErrorPage {...page} {...context} />
    // }
    throw TypeError('Unknown page: ' + JSON.stringify(page))
  }
}