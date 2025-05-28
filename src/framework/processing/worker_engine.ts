import { CommandHandler, ProcessingEngine } from '../types/modules'
import { CommandSystemDonate, CommandUIRender, isCommand, Response, PayloadString, PayloadVoid } from '../types/commands'

// Extend the CommandUIRender type to include prompt property
interface ExtendedCommandUIRender extends CommandUIRender {
  prompt?: any;
}

export default class WorkerProcessingEngine implements ProcessingEngine {
  sessionId: String
  worker: Worker
  commandHandler: CommandHandler
  isInitialized: boolean = false

  resolveInitialized!: () => void
  resolveContinue!: () => void
  selectedPlatform: string = ''  // Start with no platform selected

  constructor (sessionId: string, worker: Worker, commandHandler: CommandHandler) {
    this.sessionId = sessionId
    this.commandHandler = commandHandler
    this.worker = worker
    this.worker.onerror = (error) => {
      console.error('[WorkerProcessingEngine] Worker error:', error)
    }
    this.worker.onmessage = (event) => {
      console.debug('[WorkerProcessingEngine] Received event:', event.data.eventType)
      this.handleEvent(event)
    }

    this.trackUserStart(sessionId)
  }

  trackUserStart (sessionId: string): void {
    const key = `${sessionId}-tracking`
    const jsonString = JSON.stringify({ message: 'user started' })
    const command: CommandSystemDonate = { __type__: 'CommandSystemDonate', key, json_string: jsonString }
    this.commandHandler.onCommand(command).then(
      () => {
        console.debug('[WorkerProcessingEngine] User tracking started')
      },
      (error) => {
        console.error('[WorkerProcessingEngine] Failed to start user tracking:', error)
      }
    )
  }

  handleEvent (event: any): void {
    const { eventType } = event.data
    console.debug('[WorkerProcessingEngine] Handling event:', eventType)
    
    switch (eventType) {
      case 'initialiseDone':
        console.debug('[WorkerProcessingEngine] Initialization complete')
        this.isInitialized = true
        this.resolveInitialized()
        break

      case 'runCycleDone':
        console.debug('[WorkerProcessingEngine] Run cycle complete, handling script event')
        this.handleRunCycle(event.data.scriptEvent)
        break

      case 'runCycleFailed':
      case 'initialiseFailed':
        console.error('[WorkerProcessingEngine] Operation failed:', event.data.error)
        // Retry initialization if it failed
        if (eventType === 'initialiseFailed' && !this.isInitialized) {
          console.debug('[WorkerProcessingEngine] Retrying initialization...')
          this.worker.postMessage({ eventType: 'initialise' })
        }
        break
        
      default:
        console.warn('[WorkerProcessingEngine] Received unsupported event type:', eventType)
    }
  }

  start (): void {
    console.debug('[WorkerProcessingEngine] Starting engine')
    
    this.waitForInitialization()
      .then(() => {
        // Check if platform is already selected (direct setting)
        if (this.selectedPlatform) {
          console.debug(`[WorkerProcessingEngine] Platform already set to ${this.selectedPlatform}, skipping platform selection`)
          return this.waitForSplashScreen();
        } else {
          // Otherwise wait for user to select platform
          return this.waitForPlatformSelection()
            .then(() => this.waitForSplashScreen());
        }
      })
      .then(() => {
        console.debug('[WorkerProcessingEngine] Starting first run cycle after splash screen')
        this.firstRunCycle()
      })
      .catch((error) => {
        console.error('[WorkerProcessingEngine] Error in initial flow:', error)
      })
  }

  async waitForInitialization (): Promise<void> {
    console.debug('[WorkerProcessingEngine] Waiting for initialization')
    
    // If already initialized, return immediately
    if (this.isInitialized) {
      console.debug('[WorkerProcessingEngine] Already initialized, returning immediately')
      return Promise.resolve()
    }
    
    return await new Promise<void>((resolve, reject) => {
      this.resolveInitialized = resolve
      
      // Add timeout for initialization - increased to 30 seconds to allow for Pyodide loading
      const timeout = setTimeout(() => {
        console.error('[WorkerProcessingEngine] Worker initialization timeout after 30 seconds')
        reject(new Error('Worker initialization timed out'))
      }, 30000) // 30 second timeout instead of 10 seconds
      
      // Update resolveInitialized to clear timeout on successful initialization
      const originalResolve = this.resolveInitialized
      this.resolveInitialized = () => {
        clearTimeout(timeout)
        console.debug('[WorkerProcessingEngine] Initialization completed successfully, clearing timeout')
        originalResolve()
      }
      
      console.debug('[WorkerProcessingEngine] Sending initialise event to worker')
      this.worker.postMessage({ eventType: 'initialise' })
    })
  }

  async waitForPlatformSelection(): Promise<void> {
    console.debug('[WorkerProcessingEngine] Waiting for platform selection')
    return await new Promise<void>((resolve) => {
      this.resolveContinue = resolve
      this.renderPlatformSelector()
    })
  }

  renderPlatformSelector(): void {
    console.debug('[WorkerProcessingEngine] Rendering platform selector')
    const command: CommandUIRender = { __type__: 'CommandUIRender', page: { __type__: 'PropsUIPagePlatformSelector' } }
    if (isCommand(command)) {
      this.commandHandler.onCommand(command).then(
        (response) => {
          if (response.payload.__type__ === 'PayloadString') {
            this.selectedPlatform = (response.payload as PayloadString).value
            console.debug(`[WorkerProcessingEngine] Platform selected: ${this.selectedPlatform}`)
          }
          this.resolveContinue()
        },
        (error) => {
          console.error('[WorkerProcessingEngine] Error rendering platform selector:', error)
        }
      )
    }
  }

  async waitForSplashScreen(): Promise<void> {
    console.debug('[WorkerProcessingEngine] Waiting for splash screen')
    return await new Promise<void>((resolve) => {
      this.resolveContinue = resolve
      this.renderSplashScreen()
    })
  }

  renderSplashScreen(): void {
    console.debug(`[WorkerProcessingEngine] Rendering splash screen for ${this.selectedPlatform}`)
    const command: CommandUIRender = { 
      __type__: 'CommandUIRender', 
      page: { 
        __type__: 'PropsUIPageSplashScreen', 
        platform: this.selectedPlatform 
      } 
    }
    if (isCommand(command)) {
      this.commandHandler.onCommand(command).then(
        (_response) => {
          console.debug('[WorkerProcessingEngine] Splash screen rendered successfully')
          this.resolveContinue()
        },
        (error) => {
          console.error('[WorkerProcessingEngine] Error rendering splash screen:', error)
        }
      )
    }
  }

  firstRunCycle (): void {
    console.debug('[WorkerProcessingEngine] Starting first run cycle with session ID:', this.sessionId)
    
    // Send the platform information along with the sessionId to initialize the Python script with the correct platform
    this.worker.postMessage({ 
      eventType: 'firstRunCycle', 
      sessionId: this.sessionId,
      platform: this.selectedPlatform 
    })
  }

  nextRunCycle (response: Response): void {
    if (!response || !response.command) {
      console.error('[WorkerProcessingEngine] Invalid response object passed to nextRunCycle')
      return
    }
    
    if (this.isInitialized) {
      console.debug('[WorkerProcessingEngine] Moving to next run cycle')
      console.debug('[WorkerProcessingEngine] Response payload type:', response.payload.__type__)
      console.debug('[WorkerProcessingEngine] Command type:', response.command.__type__)
      
      this.worker.postMessage({ eventType: 'nextRunCycle', response })
    } else {
      console.warn('[WorkerProcessingEngine] Attempted to run next cycle before initialization')
      console.warn('[WorkerProcessingEngine] Please call waitForInitialization() first')
      // You could throw an error here alternatively
    }
  }

  terminate (): void {
    console.debug('[WorkerProcessingEngine] Terminating worker')
    this.worker.terminate()
  }

  handleRunCycle (command: any): void {
    console.debug('[WorkerProcessingEngine] Handling run cycle command:', command)
    
    if (isCommand(command)) {
      // Special handling for CommandSystemExit to capture exitInfo
      if (command.__type__ === 'CommandSystemExit') {
        console.debug('[WorkerProcessingEngine] Exit command detected with info:', command.info);
        // After CommandSystemExit, we need to pass this info to the worker for the next cycle
        this.worker.postMessage({ 
          eventType: 'setExitInfo', 
          exitInfo: command.info 
        });
      }

      // Log detailed information about the command
      if (command.__type__ === 'CommandUIRender') {
        const uiCommand = command as ExtendedCommandUIRender;
        if (uiCommand.page) {
          console.debug('[WorkerProcessingEngine] UI Render command with page type:', uiCommand.page.__type__)
          console.debug('[WorkerProcessingEngine] Page properties:', Object.keys(uiCommand.page))
        } else if (uiCommand.prompt) {
          console.debug('[WorkerProcessingEngine] UI Render command with prompt type:', uiCommand.prompt.__type__)
          console.debug('[WorkerProcessingEngine] Prompt properties:', Object.keys(uiCommand.prompt))
        }
      }

      this.commandHandler.onCommand(command).then(
        (response) => {
          console.debug('[WorkerProcessingEngine] Command handled successfully')
          console.debug('[WorkerProcessingEngine] Response payload type:', response.payload.__type__)
          console.debug('[WorkerProcessingEngine] Command type:', command.__type__)
          
          if (command.__type__ === 'CommandUIRender') {
            const uiCommand = command as ExtendedCommandUIRender;
            if (uiCommand.page) {
              // Handle page types
              const pageType = uiCommand.page.__type__ as string
              console.debug('[WorkerProcessingEngine] Page type:', pageType)
              
              // Handle different page types using a switch statement
              switch (pageType) {
                case 'PropsUIPageEnd':
                  console.debug('[WorkerProcessingEngine] End page rendered, stopping cycle')
                  // Don't continue cycle for end pages
                  return
                case 'PropsUIPageSplashScreen':
                  console.debug('[WorkerProcessingEngine] Splash screen rendered')
                  break
                case 'PropsUIPageDonation':
                  console.debug('[WorkerProcessingEngine] Donation page rendered (file upload)')
                  break
                case 'PropsUIPageConsent':
                  console.debug('[WorkerProcessingEngine] Consent page rendered')
                  break
                default:
                  console.debug('[WorkerProcessingEngine] Unknown page type:', pageType)
                  break
              }
            } else if (uiCommand.prompt) {
              // Handle prompt types
              const promptType = uiCommand.prompt.__type__ as string
              console.debug('[WorkerProcessingEngine] Prompt type:', promptType)
              
              // Handle different prompt types
              switch (promptType) {
                case 'PropsUIPromptFileInput':
                  console.debug('[WorkerProcessingEngine] File input prompt rendered')
                  break
                default:
                  console.debug('[WorkerProcessingEngine] Unknown prompt type:', promptType)
                  break
              }
            }
            
            // For all UI commands, if we get a void payload, continue to next cycle
            if (response.payload.__type__ === 'PayloadVoid') {
              console.debug('[WorkerProcessingEngine] Void payload received, continuing to next cycle')
              this.nextRunCycle(response)
            } else {
              console.debug('[WorkerProcessingEngine] Non-void payload received:', response.payload.__type__)
              // For non-void payloads (like file selection), also continue to next cycle
              this.nextRunCycle(response)
            }
          } else {
            console.debug('[WorkerProcessingEngine] Non-UI command received')
            // For non-UI commands, continue the cycle
            this.nextRunCycle(response)
          }
        },
        (error) => {
          console.error('[WorkerProcessingEngine] Error handling command:', error)
        }
      )
    } else {
      console.error('[WorkerProcessingEngine] Invalid command received:', command)
    }
  }

  // Add a method to set the platform directly and bypass platform selection
  setPlatform(platform: string): void {
    console.debug(`[WorkerProcessingEngine] Setting platform directly: ${platform}`)
    this.selectedPlatform = platform
    
    // Don't trigger resolveContinue here as it would bypass waiting for splash screen
    // We'll handle the flow in the start method instead
  }
}