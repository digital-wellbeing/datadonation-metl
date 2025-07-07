import { isInstanceOf } from '../helpers'
import { PropsUIHeader } from './elements'
import {
  PropsUIPromptFileInput,
  PropsUIPromptConfirm,
  PropsUIPromptConsentForm,
  PropsUIPromptRadioInput,
  // PropsUIPromptQuestionnaire
} from './prompts'
import React from 'react'

export type PropsUIPage =
  PropsUIPagePlatformSelector |
  PropsUIPageSplashScreen |
  PropsUIPageDonation |
  PropsUIPageEnd |
  PropsUIPageError |
  PropsUIPageWrapper

export function isPropsUIPage (arg: any): arg is PropsUIPage {
  return (
    isPropsUIPagePlatformSelector(arg) ||
    isPropsUIPageSplashScreen(arg) ||
    isPropsUIPageDonation(arg) ||
    isPropsUIPageEnd(arg) ||
    isPropsUIPageError(arg) ||
    isPropsUIPageWrapper(arg)
  )
}

// New wrapper page type to directly render a React component
export interface PropsUIPageWrapper {
  __type__: 'PropsUIPageWrapper'
  component: React.ReactNode
}

export function isPropsUIPageWrapper (arg: any): arg is PropsUIPageWrapper {
  return isInstanceOf<PropsUIPageWrapper>(arg, 'PropsUIPageWrapper', ['component'])
}

export interface PropsUIPagePlatformSelector {
  __type__: 'PropsUIPagePlatformSelector'
}
export function isPropsUIPagePlatformSelector (arg: any): arg is PropsUIPagePlatformSelector {
  return isInstanceOf<PropsUIPagePlatformSelector>(arg, 'PropsUIPagePlatformSelector', [])
}

export interface PropsUIPageSplashScreen {
  __type__: 'PropsUIPageSplashScreen'
  platform: string
}
export function isPropsUIPageSplashScreen (arg: any): arg is PropsUIPageSplashScreen {
  return isInstanceOf<PropsUIPageSplashScreen>(arg, 'PropsUIPageSplashScreen', ['platform'])
}

export interface PropsUIPageDonation {
  __type__: 'PropsUIPageDonation'
  platform: string
  header: PropsUIHeader
  body: PropsUIPromptFileInput | PropsUIPromptConfirm | PropsUIPromptConsentForm | PropsUIPromptRadioInput
  // footer: PropsUIFooter
}
export function isPropsUIPageDonation (arg: any): arg is PropsUIPageDonation {
  return isInstanceOf<PropsUIPageDonation>(arg, 'PropsUIPageDonation', ['platform', 'header', 'body'])
}

export interface PropsUIPageEnd {
  __type__: 'PropsUIPageEnd'
  donated?: boolean
}
export function isPropsUIPageEnd (arg: any): arg is PropsUIPageEnd {
  return isInstanceOf<PropsUIPageEnd>(arg, 'PropsUIPageEnd', [])
}

export interface PropsUIPageError {
  __type__: 'PropsUIPageError'
  stacktrace: string
}
export function isPropsUIPageError (arg: any): arg is PropsUIPageError {
  return isInstanceOf<PropsUIPageError>(arg, 'PropsUIPageError', ['stacktrace'])
}