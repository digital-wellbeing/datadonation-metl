import * as ReactDOM from 'react-dom/client'
import { VisualisationEngine } from '../../types/modules'
import { Response, Payload, CommandUIRender } from '../../types/commands'
import { PropsUIPage } from '../../types/pages'
import VisualisationFactory from './factory'
import { Main } from './main'

export default class ReactEngine implements VisualisationEngine {
  factory: VisualisationFactory
  rootElement: HTMLElement | null = null
  locale: string = 'en'
  root: ReactDOM.Root | null = null
  isInitialized: boolean = false

  constructor (factory: VisualisationFactory) {
    this.factory = factory
  }

  start (rootElement: HTMLElement, locale: string): void {
    console.log('[ReactEngine] started with rootElement:', rootElement)
    
    if (!rootElement) {
      console.error('[ReactEngine] No root element provided')
      return
    }
    
    try {
      this.rootElement = rootElement
      
      // Check if this element already has a React root attached
      // We can check this by looking for the internal root property
      const existingRootKey = Object.keys(rootElement).find(key => 
        key.startsWith('__reactContainer$') || key.startsWith('_reactRootContainer')
      )
      
      if (existingRootKey) {
        console.log('[ReactEngine] Root already exists for this element, reusing')
        // If already exists, but our reference is missing, try to re-create
        if (!this.root) {
          try {
            this.root = ReactDOM.createRoot(rootElement)
            console.log('[ReactEngine] Re-created root reference for existing root')
          } catch (error) {
            console.warn('[ReactEngine] Error creating root on existing container, continuing with current state:', error)
          }
        }
      } else {
        // No existing root, create new one
        this.root = ReactDOM.createRoot(rootElement)
        console.log('[ReactEngine] Created new root')
      }
      
      this.locale = locale
      this.isInitialized = true
      console.log('[ReactEngine] Initialization complete')
    } catch (error) {
      console.error('[ReactEngine] Failed to initialize:', error)
      this.isInitialized = false
    }
  }

  async render (command: CommandUIRender): Promise<Response> {
    console.log('[ReactEngine] Rendering command:', command.__type__)
    
    // Ensure we're initialized before rendering
    if (!this.isInitialized || !this.root) {
      console.warn('[ReactEngine] Not initialized, attempting to reinitialize')
      this.ensureInitialized()
    }
    
    return await new Promise<Response>((resolve, reject) => {
      try {
        if (!command.page) {
          console.error('[ReactEngine] No page in command:', command)
          reject(new Error('No page in command'))
          return
        }
        
        console.log('[ReactEngine] Rendering page type:', command.page.__type__)
        
        // Special logging for end pages to track submission ID
        if (command.page.__type__ === 'PropsUIPageEnd') {
          console.log('[ReactEngine] [SUBMISSION_TRACKING] Rendering end page');
          console.log('[ReactEngine] [SUBMISSION_TRACKING] End page info field:', (command.page as any).info);
          console.log('[ReactEngine] [SUBMISSION_TRACKING] Current window.submissionId:', window.submissionId);
          console.log('[ReactEngine] [SUBMISSION_TRACKING] End page props:', command.page);
        }
        
        // Create the page to render based on the page props
        try {
          // Create a proper context object with locale and resolve function
          const context = { 
            locale: this.locale, 
            resolve: (payload: unknown) => {
              console.debug('[ReactEngine] Page event occurred with payload:', payload)
              resolve({ __type__: 'Response', command, payload: payload as Payload })
            }
          };
          
          const page: JSX.Element = this.factory.createPage(command.page, context);
          
          // Render the page components
          this.renderPage(command.page)

          // Dismiss any loading screen - replace the entire content with our app UI
          if (this.root) {
            console.log('[ReactEngine] Rendering page with props type:', command.page.__type__)
            this.root.render(page)
            console.log('[ReactEngine] Page component created, rendering to DOM')
          } else {
            console.error('[ReactEngine] No root element available for rendering')
            reject(new Error('No root element available for rendering'))
          }
        } catch (error) {
          console.error('[ReactEngine] Error creating or rendering page component:', error)
          reject(error)
        }
      } catch (error) {
        console.error('[ReactEngine] Error in render:', error)
        reject(error)
      }
    })
  }

  // Ensure we have a valid root to render to
  private ensureInitialized(): void {
    if (this.isInitialized && this.root) {
      return
    }
    
    console.log('[ReactEngine] Attempting to reinitialize')
    
    // If we have a rootElement, try to create a new root
    if (this.rootElement) {
      try {
        // Check if this element already has a React root attached
        const existingRootKey = Object.keys(this.rootElement).find(key => 
          key.startsWith('__reactContainer$') || key.startsWith('_reactRootContainer')
        )
        
        if (existingRootKey) {
          console.log('[ReactEngine] Root already exists for this element during reinitialization, reusing')
          // If already exists, but our reference is missing, try to re-create
          this.root = ReactDOM.createRoot(this.rootElement)
          console.log('[ReactEngine] Re-created root reference')
        } else {
          // No existing root, create new one
          this.root = ReactDOM.createRoot(this.rootElement)
          console.log('[ReactEngine] Created new root during reinitialization')
        }
        
        this.isInitialized = true
        console.log('[ReactEngine] Successfully reinitialized')
      } catch (error) {
        console.error('[ReactEngine] Failed to reinitialize with existing rootElement:', error)
      }
      return
    }
    
    // If we don't have a rootElement, try to find the default one
    try {
      const defaultRoot = document.getElementById('root')
      if (defaultRoot) {
        // Check if this element already has a React root
        const existingRootKey = Object.keys(defaultRoot).find(key => 
          key.startsWith('__reactContainer$') || key.startsWith('_reactRootContainer')
        )
        
        this.rootElement = defaultRoot
        
        if (existingRootKey) {
          console.log('[ReactEngine] Root already exists for default element, reusing')
          this.root = ReactDOM.createRoot(defaultRoot)
          console.log('[ReactEngine] Re-created root reference for default element')
        } else {
          this.root = ReactDOM.createRoot(defaultRoot)
          console.log('[ReactEngine] Created new root for default element')
        }
        
        this.isInitialized = true
        console.log('[ReactEngine] Successfully initialized with default root element')
      } else {
        console.error('[ReactEngine] Could not find default root element')
      }
    } catch (error) {
      console.error('[ReactEngine] Failed to initialize with default root:', error)
    }
  }

  async renderPage (props: PropsUIPage): Promise<any> {
    console.log('[ReactEngine] Rendering page with props type:', props.__type__)
    
    // Make sure we're initialized
    if (!this.isInitialized || !this.root) {
      this.ensureInitialized()
      
      if (!this.isInitialized || !this.root) {
        return Promise.reject(new Error('Failed to initialize ReactEngine, cannot render page'))
      }
    }
    
    return await new Promise<any>((resolve, reject) => {
      try {
        const context = { locale: this.locale, resolve }
        const page = this.factory.createPage(props, context)
        
        console.log('[ReactEngine] Page component created, rendering to DOM')
        this.renderElements([page])
      } catch (error) {
        console.error('[ReactEngine] Error creating page component:', error)
        reject(error)
      }
    })
  }

  terminate (): void {
    console.log('[ReactEngine] stopped')
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
    this.isInitialized = false
  }

  renderElements (elements: JSX.Element[]): void {
    if (!this.root) {
      console.error('[ReactEngine] Cannot render elements: root is not initialized')
      this.ensureInitialized()
      
      if (!this.root) {
        console.error('[ReactEngine] Failed to initialize root, cannot render elements')
        return
      }
    }
    
    try {
      console.log('[ReactEngine] Rendering elements to DOM')
      this.root.render(<Main elements={elements} />)
    } catch (error) {
      console.error('[ReactEngine] Error rendering elements:', error)
    }
  }
}
