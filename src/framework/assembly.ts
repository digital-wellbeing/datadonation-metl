import ReactEngine from './visualisation/react/engine'
import ReactFactory from './visualisation/react/factory'
import WorkerProcessingEngine from './processing/worker_engine'
import { VisualisationEngine, ProcessingEngine, Bridge } from './types/modules'
import CommandRouter from './command_router'

export default class Assembly {
  visualisationEngine: VisualisationEngine
  processingEngine: ProcessingEngine
  router: CommandRouter
  private initialized: boolean = false

  constructor (worker: Worker, bridge: Bridge) {
    const sessionId = String(Date.now())
    this.visualisationEngine = new ReactEngine(new ReactFactory())
    this.router = new CommandRouter(bridge, this.visualisationEngine)
    this.processingEngine = new WorkerProcessingEngine(sessionId, worker, this.router)
  }
  
  /**
   * Initialize the visualization engine with the DOM root element
   * This must be called before using the assembly
   */
  initialize(rootElement: HTMLElement, locale: string): void {
    if (!rootElement) {
      console.error('[Assembly] No root element provided for initialization')
      return
    }
    
    console.log('[Assembly] Initializing with root element and locale:', locale)
    this.visualisationEngine.start(rootElement, locale)
    this.initialized = true
  }
  
  /**
   * Check if the assembly is properly initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }
}
