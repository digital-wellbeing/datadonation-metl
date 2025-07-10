import './fonts.css'
import './framework/styles.css'
import Assembly from './framework/assembly'
import { Bridge } from './framework/types/modules'
import LiveBridge from './live_bridge'
import FakeBridge from './fake_bridge'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { LoadingScreen } from './framework/visualisation/react/ui/elements/LoadingScreen'
import { PlatformSelector } from './framework/visualisation/react/ui/pages/platform_selector'

// Find the root element
const rootElement = document.getElementById('root') as HTMLElement
if (!rootElement) {
  console.error('Could not find root element for the app')
}

// Create a root React instance
const root = ReactDOM.createRoot(rootElement);

// Log application version
console.log('🚀 Feldspar Data Donation v0.1.0 - Ready to collect data donations!');

// Global assembly that will be initialized when needed
let assembly: Assembly;

// Store the worker reference
let worker: Worker;

// Function to initialize the backend worker
const initializeWorker = () => {
  // Create worker
  const workerFile = new URL('./framework/processing/py_worker.js', import.meta.url)
  worker = new Worker(workerFile)

  // Add error handling for worker
  worker.onerror = (error) => {
    console.error('[Worker Error]:', error)
  }

  worker.onmessageerror = (event) => {
    console.error('[Worker Message Error]:', event)
  }
  
  return worker;
}

// Function to initialize the application with backend processing
const initializeBackend = async (platform: string, locale: string): Promise<void> => {
  try {
    // Show loading screen
    root.render(
      <LoadingScreen 
        message={`Preparing ${platform} Data Donation`} 
        showLoadingInfo={true}
      />
    );

    // Initialize worker if not already done
    if (!worker) {
      worker = initializeWorker();
    }
    
    // Create assembly - use a FakeBridge for the prototype
    assembly = new Assembly(worker, new FakeBridge())
    
    console.log('[Index] Starting initialization');
    
    // Initialize the visualization engine with the root element
    if (rootElement) {
      assembly.initialize(rootElement, locale);
      console.log('[Index] Assembly initialized with root element');
    } else {
      console.error('[Index] Could not initialize assembly - no root element');
      return;
    }
    
    // Start worker initialization with retries
    const MAX_RETRIES = 3;
    let retries = 0;
    let initialized = false;
    
    while (!initialized && retries < MAX_RETRIES) {
      try {
        console.log(`[Index] Attempting worker initialization (attempt ${retries + 1}/${MAX_RETRIES})...`);
        await assembly.processingEngine.waitForInitialization();
        initialized = true;
        console.log('[Index] Worker initialization successful');
      } catch (error) {
        retries++;
        const waitTime = retries * 3000; // Exponential backoff
        console.error(`[Worker Initialization Error] (attempt ${retries}/${MAX_RETRIES}):`, error);
        
        if (retries >= MAX_RETRIES) {
          console.error('[Index] Max retries reached. Continuing with uninitialized worker.');
          // Continue with app render anyway - the App component will handle retry during user interaction
        } else {
          console.log(`[Index] Retrying in ${waitTime/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // Set the platform directly on the processing engine before starting it
    console.log(`[Index] Setting platform directly on processing engine: ${platform}`);
    (assembly.processingEngine as any).setPlatform(platform);
    
    // Start the processing engine
    assembly.processingEngine.start();
    
    // Make the processing engine available globally for the bridge
    (window as any).workerEngine = assembly.processingEngine;
    console.log('[Index] Processing engine made available globally');
    
    // Render the app using BrowserRouter, using the assembly's own rendering mechanism
    console.log('[Index] Rendering app...');
    assembly.visualisationEngine.render({
      __type__: 'CommandUIRender',
      page: {
        __type__: 'PropsUIPageWrapper',
        component: (
          <BrowserRouter>
            <App assembly={assembly} locale={locale} selectedPlatform={platform} />
          </BrowserRouter>
        )
      }
    });
  } catch (error) {
    console.error('[Assembly Error]:', error);
  }
}

// Function to handle platform selection
const handlePlatformSelect = (platform: string, locale: string = 'en') => {
  console.log(`[Index] Platform selected: ${platform}, initializing backend`);
  // Initialize backend with selected platform
  initializeBackend(platform, locale);
}

// Check if there's a platform in the URL on initial load
const checkUrlForPlatform = () => {
  const path = window.location.pathname;
  const platformMatch = path.match(/^\/([^/]+)(\/.*)?$/);
  
  if (platformMatch && platformMatch[1]) {
    const platformLower = platformMatch[1].toLowerCase();
    // Support all valid platforms (currently TikTok and ActivityWatch)
    if (['tiktok', 'activitywatch'].includes(platformLower)) {
      console.log(`[Index] Platform found in URL: ${platformLower}`);
      // Initialize with the platform from URL - capitalize first letter
      const platformProper = platformLower.charAt(0).toUpperCase() + platformLower.slice(1);
      handlePlatformSelect(platformProper);
      return true;
    }
  }
  return false;
}

// Initial render - check URL for platform or show platform selector
if (rootElement) {
  // Check if we should initialize with a platform from the URL
  if (!checkUrlForPlatform()) {
    // Otherwise, show the platform selector
    root.render(
      <BrowserRouter>
        <div className="w-full h-full p-4 sm:p-6 md:p-8 lg:p-10">
          <PlatformSelector 
            locale={'en'} 
            resolve={(payload: any) => {
              if (payload.__type__ === 'PayloadString') {
                console.log(`[Index] Platform selected from selector: ${payload.value}`);
                handlePlatformSelect(payload.value);
                // Note: URL navigation is now handled directly in the PlatformSelector component
              }
            }} 
          />
        </div>
      </BrowserRouter>
    );
  }
}

const observer = new ResizeObserver(() => {
  const height = window.document.body.scrollHeight
  const action = 'resize'
  window.parent.postMessage({ action, height }, '*')
})

observer.observe(document.body)
