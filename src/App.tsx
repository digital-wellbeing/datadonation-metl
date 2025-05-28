import React, { useEffect } from 'react'
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { PlatformSelector } from './framework/visualisation/react/ui/pages/platform_selector'
import { SplashScreen } from './framework/visualisation/react/ui/pages/splash_screen'
import { DonationPage } from './framework/visualisation/react/ui/pages/donation_page'
import { EndPage } from './framework/visualisation/react/ui/pages/end_page'
import Assembly from './framework/assembly'
import { CommandUIRender, isCommand, Response } from './framework/types/commands'
import TextBundle from './framework/text_bundle'

interface AppProps {
  assembly: Assembly
  locale: string
  selectedPlatform?: string
}

const App: React.FC<AppProps> = ({ assembly, locale, selectedPlatform }) => {
  const navigate = useNavigate()
  const location = useLocation()
  
  // Check if we should enforce the starting path or redirect to the selected platform
  useEffect(() => {
    const path = location.pathname;
    
    // If a platform was selected (e.g., through props), navigate to that platform's splash screen
    if (selectedPlatform && path === '/') {
      console.log(`[App] Platform already selected, navigating to ${selectedPlatform}`);
      navigate(`/${selectedPlatform.toLowerCase()}`);
      return;
    }
    
    // If we're at a platform path, extract the platform from the URL
    const platformMatch = path.match(/^\/([^/]+)(\/.*)?$/);
    if (platformMatch && platformMatch[1] && !['tiktok', 'activitywatch'].includes(platformMatch[1].toLowerCase())) {
      console.log('[App] Invalid platform detected in URL, redirecting to platform selection');
      navigate('/');
    }
  }, [navigate, selectedPlatform, location]);

  const handlePlatformSelect = (platform: string) => {
    console.log(`[App] Platform selected: ${platform}, updating URL`);
    // Navigate to the platform-specific route
    navigate(`/${platform.toLowerCase()}`);
    
    // No need to call anything else - the route change will trigger the SplashScreen component
  }

  const handleSplashScreenContinue = async (payload: any) => {
    const platform = location.pathname.split('/')[1]
    
    // Create title text bundle
    const titleText = new TextBundle()
    titleText.add('en', `${platform} Data Donation`)
    titleText.add('nl', `${platform} Data Donatie`)

    // Create description text bundle
    const descriptionText = new TextBundle()
    descriptionText.add('en', 'Please select your data file to donate')
    descriptionText.add('nl', 'Selecteer het databestand om te doneren')

    // Navigate to the donation page with the platform in the URL
    navigate(`/${platform}/donation`)

    // Create a command to move to the next step
    const command: CommandUIRender = {
      __type__: 'CommandUIRender',
      page: {
        __type__: 'PropsUIPageDonation',
        platform: platform,
        header: {
          __type__: 'PropsUIHeader',
          title: titleText
        },
        body: {
          __type__: 'PropsUIPromptFileInput',
          description: descriptionText,
          extensions: '.zip, .json'
        }
      }
    }

    if (isCommand(command)) {
      const response: Response = { 
        __type__: 'Response' as const, 
        command: command, 
        payload: { __type__: 'PayloadVoid' as const, value: undefined } 
      }
      
      // Check if the processing engine is initialized
      const processingEngine = assembly.processingEngine;
      
      // Wait for initialization if needed
      if (!processingEngine.isInitialized) {
        console.debug('[App] Processing engine not initialized yet, waiting...');
        
        // Set up retry mechanism
        const MAX_RETRIES = 3;
        let retries = 0;
        
        while (retries < MAX_RETRIES) {
          try {
            console.debug(`[App] Attempting initialization (attempt ${retries + 1}/${MAX_RETRIES})...`);
            await processingEngine.waitForInitialization();
            console.debug('[App] Processing engine initialized successfully');
            break;
          } catch (error: unknown) {
            retries++;
            const waitTime = retries * 2000; // Exponential backoff - wait 2s, then 4s, then 6s
            console.error(`[App] Error waiting for initialization (attempt ${retries}/${MAX_RETRIES}):`, error);
            
            if (retries >= MAX_RETRIES) {
              console.error('[App] Max retries reached. Cannot continue.');
              alert('There was a problem initializing the application. Please try refreshing the page.');
              return;
            }
            
            console.debug(`[App] Retrying in ${waitTime/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      // Now we can safely call nextRunCycle
      processingEngine.nextRunCycle(response)
    }
  }

  // Function to handle donation page commands
  const handleDonationPageCommand = (command: any) => {
    const platform = location.pathname.split('/')[1]
    
    // If the command is to move to the end page, navigate to the end page route
    if (command.__type__ === 'CommandUIRender' && 
        command.page.__type__ === 'PropsUIPageEnd') {
      navigate(`/${platform}/end`)
    }
    
    // Pass the command to the processing engine
    if (isCommand(command)) {
      const response: Response = { 
        __type__: 'Response' as const, 
        command: command, 
        payload: { __type__: 'PayloadVoid' as const, value: undefined } 
      }
      
      assembly.processingEngine.nextRunCycle(response)
    }
  }

  // Extract platform from URL for components that need it
  const getPlatformFromUrl = () => {
    return location.pathname.split('/')[1] || ''
  }

  return (
    <Routes>
      {/* Default route redirects to the platform selector */}
      <Route path="/" element={
        <PlatformSelector 
          locale={locale} 
          resolve={(payload: any) => {
            if (payload.__type__ === 'PayloadString') {
              handlePlatformSelect(payload.value)
            }
          }} 
        />
      } />
      
      {/* Platform-specific routes */}
      <Route path="/:platform" element={
        <SplashScreen 
          locale={locale}
          platform={getPlatformFromUrl()}
          resolve={(payload: any) => {
            handleSplashScreenContinue(payload)
          }}
        />
      } />
      
      {/* Donation page route */}
      <Route path="/:platform/donation" element={
        <DonationPage
          locale={locale}
          platform={getPlatformFromUrl()}
          header={{
            __type__: 'PropsUIHeader',
            title: new TextBundle().add('en', `${getPlatformFromUrl()} Data Donation`)
          }}
          body={{
            __type__: 'PropsUIPromptFileInput',
            description: new TextBundle().add('en', 'Please select your data file to donate'),
            extensions: '.zip, .json'
          }}
          resolve={(payload: any) => {
            // Handle file upload or other actions
            console.log('Donation page payload:', payload)
            
            // Create a response and pass to processing engine
            if (isCommand(payload)) {
              const response: Response = { 
                __type__: 'Response' as const, 
                command: payload, 
                payload: { __type__: 'PayloadVoid' as const, value: undefined } 
              }
              
              // Pass to processing engine
              assembly.processingEngine.nextRunCycle(response)
              
              // Check if we need to navigate to end page
              if (payload.__type__ === 'CommandUIRender' && 
                  payload.page && 
                  payload.page.__type__ === 'PropsUIPageEnd') {
                navigate(`/${getPlatformFromUrl()}/end`)
              }
            }
          }}
        />
      } />
      
      {/* End page route */}
      <Route path="/:platform/end" element={
        <EndPage
          locale={locale}
          info={`Platform: ${getPlatformFromUrl()}`}
          resolve={(payload: any) => {
            console.log('End page payload:', payload)
          }}
        />
      } />
      
      {/* Catch-all route redirects to platform selection */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App 