let pyScript

onmessage = (event) => {
  const { eventType } = event.data
  switch (eventType) {
    case 'initialise':
      console.log('[ProcessingWorker] Starting initialization process')
      initialise().then(() => {
        console.log('[ProcessingWorker] Initialization completed successfully')
        self.postMessage({ eventType: 'initialiseDone' })
      }).catch(error => {
        console.error('[ProcessingWorker] Initialization failed:', error)
        self.postMessage({ 
          eventType: 'initialiseFailed',
          error: error.toString()
        })
      })
      break

    case 'setExitInfo':
      // Store exit info for later use in the end page
      const { exitInfo } = event.data;
      console.log('[ProcessingWorker] Received exit info:', exitInfo);
      self.lastEventInfo = exitInfo;
      break

    case 'showEndPage':
      // Trigger end page rendering after database operation completes
      console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Received showEndPage event, rendering end page');
      try {
        console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Calling Python render_end_page() from showEndPage handler');
        const endPageCommand = self.pyodide.runPython(`
          # Import and call the render_end_page function directly from the script module
          from port.script import render_end_page
          end_page_cmd = render_end_page()
          end_page_cmd.toDict() if hasattr(end_page_cmd, 'toDict') else end_page_cmd
        `);
        
        console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Python created end page command from showEndPage:', endPageCommand);
        
        // Convert Python object to JavaScript object
        const jsEndPageCommand = endPageCommand.toJs({
          create_proxies: false,
          dict_converter: Object.fromEntries
        });
        
        // Update state to end_page in Python
        self.pyodide.runPython(`
          old_state = py_script._current_state
          py_script._current_state = 'end_page'
          print("State transition:", old_state, "->", "end_page")
        `);
        
        console.log('[ProcessingWorker] State transition to end_page from showEndPage');
        
        // Send the converted JavaScript end page command back to the main thread
        self.postMessage({
          eventType: 'runCycleDone',
          scriptEvent: jsEndPageCommand
        });
        
      } catch (error) {
        console.error('[ProcessingWorker] [SUBMISSION_TRACKING] Error calling Python render_end_page() from showEndPage:', error);
        
        // Fallback: Create end page with donation status
        const endPageCommand = {
          __type__: 'CommandUIRender',
          page: {
            __type__: 'PropsUIPageEnd',
            locale: 'en',
            info: self.lastEventInfo || '',
            donated: !!self.lastEventInfo  // If we have exit info, assume donation was attempted
          }
        };
        
        console.log('[ProcessingWorker] Created fallback end page command from showEndPage:', endPageCommand);
        
        // Update state to end_page in Python
        self.pyodide.runPython(`
          old_state = py_script._current_state
          py_script._current_state = 'end_page'
          print("State transition:", old_state, "->", "end_page")
        `);
        
        // Send the fallback end page command back to the main thread
        self.postMessage({
          eventType: 'runCycleDone',
          scriptEvent: endPageCommand
        });
      }
      break

    case 'firstRunCycle':
      try {
        console.log('[ProcessingWorker] Starting Python script with sessionId:', event.data.sessionId)
        
        // Get the platform from the event data
        const platform = event.data.platform || 'TikTok'; // Default to TikTok if not provided
        console.log('[ProcessingWorker] Platform:', platform);
        
        // First verify port module is available
        const portCheck = self.pyodide.runPython(`
          import sys
          import port
          print("Port module found at:", port.__file__)
          print("Port module contents:", dir(port))
          "OK"  # Return value to verify this ran successfully
        `)
        
        if (portCheck !== "OK") {
          throw new Error('Port module verification failed')
        }

        // Now try to create the script and get first command
        self.pyodide.runPython(`
          try:
              print("Starting port.start with sessionId:", ${event.data.sessionId})
              # Ensure py_script is defined in the global context
              global py_script
              py_script = port.start(${event.data.sessionId})
              
              # Store the platform information in the global scope so it's accessible to all Python code
              platform = "${platform}"
              print("Set global platform to:", platform)
              
              # Also store it on the py_script object for backward compatibility
              py_script.platform = "${platform}"
              print("Set py_script.platform to:", py_script.platform)
              
              print("Script created:", py_script)
              print("Script type:", type(py_script))
              print("Script methods:", [method for method in dir(py_script) if not method.startswith('_')])
              
              # Get the first command by sending None to the generator
              first_command = py_script.send(None)
              print("First command:", first_command)
              
              # Store first command in a global variable
              global first_command_result
              first_command_result = first_command
          except Exception as e:
              import traceback
              print("Error during script creation:")
              traceback.print_exc()
              raise e
        `)
        
        // Get the Python script from the global namespace
        pyScript = self.pyodide.globals.get('py_script')
        
        if (!pyScript) {
          throw new Error('Failed to get Python script from global namespace')
        }

        // Get the first command result
        const firstCommand = self.pyodide.globals.get('first_command_result')
        
        if (!firstCommand) {
          throw new Error('Failed to get first command result')
        }

        console.log('[ProcessingWorker] Python script initialized successfully')
        console.log('[ProcessingWorker] First command:', firstCommand)
        
        // Send the first command back
        self.postMessage({
          eventType: 'runCycleDone',
          scriptEvent: firstCommand.toJs({
            create_proxies: false,
            dict_converter: Object.fromEntries
          })
        })
      } catch (error) {
        console.error('[ProcessingWorker] Failed to initialize Python script:', error)
        self.postMessage({
          eventType: 'initialiseFailed',
          error: error.toString()
        })
        throw error
      }
      break

    case 'nextRunCycle':
      const { response } = event.data
      
      try {
        // Verify pyScript is still accessible from JavaScript
        if (!pyScript) {
          console.error('[ProcessingWorker] JavaScript pyScript reference is null')
          throw new Error('JavaScript pyScript reference is null')
        }
        
        // Verify py_script is in global Python scope
        const isPyScriptDefined = self.pyodide.runPython(`
          result = 'py_script' in globals()
          if not result:
            print("WARNING: py_script not in globals!")
          result
        `)
        
        if (!isPyScriptDefined) {
          console.error('[ProcessingWorker] py_script not found in Python globals')
          throw new Error('py_script not in Python globals')
        }
        
        unwrap(response).then((userInput) => {
          try {
            console.log('[ProcessingWorker] Running next cycle with input:', userInput)
            runCycle(userInput)
          } catch (error) {
            console.error('[ProcessingWorker] Error in nextRunCycle:', error)
            self.postMessage({
              eventType: 'runCycleFailed',
              error: error.toString()
            })
          }
        }).catch(error => {
          console.error('[ProcessingWorker] Error unwrapping response:', error)
          self.postMessage({
            eventType: 'runCycleFailed',
            error: error.toString()
          })
        })
      } catch (error) {
        console.error('[ProcessingWorker] Error preparing nextRunCycle:', error)
        self.postMessage({
          eventType: 'runCycleFailed',
          error: error.toString()
        })
      }
      break

    default:
      console.log('[ProcessingWorker] Received unsupported event: ', eventType)
  }
}

function runCycle(payload) {
  if (!pyScript) {
    console.error('[ProcessingWorker] pyScript is not initialized')
    throw new Error('Cannot run cycle - Python script is not initialized')
  }
  
  console.log('[ProcessingWorker] Running cycle with payload:', payload)
  try {
    // Check if py_script is defined in the global Python context
    const isPyScriptDefined = self.pyodide.runPython(`
      'py_script' in globals()
    `)
    
    if (!isPyScriptDefined) {
      console.error('[ProcessingWorker] py_script not found in Python globals')
      throw new Error('py_script not available in Python global context')
    }
    
    // Get current state and page type
    const currentState = self.pyodide.runPython(`
      if not hasattr(py_script, '_current_state'):
          py_script._current_state = 'splash_screen'
          print("Initializing state to 'splash_screen'")
      else:
          print("Current state:", py_script._current_state)
      py_script._current_state
    `)
    console.log('[ProcessingWorker] Current state:', currentState)

    // Special handling for file_upload state with void payload
    if (currentState === 'file_upload' && payload.__type__ === 'PayloadVoid') {
      // Check if the previous command was a CommandSystemDonate or CommandSystemExit
      // The lastEvent is set after each command is processed
      const lastEventType = self.lastEventType;
      const lastEventInfo = self.lastEventInfo || '';
      
      // If the previous command was a donation command, don't render end page yet - wait for database response
      if (lastEventType === 'CommandSystemDonate') {
        console.log('[ProcessingWorker] Received void payload after donation, but waiting for database response');
        console.log('[ProcessingWorker] Staying on donation page until database operation completes');
        
        // Stay on donation page - don't render end page yet
        // The bridge will trigger the end page after database operation completes
        return;
      }
      
      // If the previous command was an exit command, we should show end page
      if (lastEventType === 'CommandSystemExit') {
        console.log('[ProcessingWorker] Received void payload after exit, showing end page');
        
        // Let Python handle the end page creation to ensure proper donation status tracking
        try {
          console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Calling Python render_end_page() from void payload handler');
          const endPageCommand = self.pyodide.runPython(`
            # Import and call the render_end_page function directly from the script module
            from port.script import render_end_page
            end_page_cmd = render_end_page()
            end_page_cmd.toDict() if hasattr(end_page_cmd, 'toDict') else end_page_cmd
          `);
          
          console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Python created end page command from void payload:', endPageCommand);
          
          // Convert Python object to JavaScript object
          const jsEndPageCommand = endPageCommand.toJs({
            create_proxies: false,
            dict_converter: Object.fromEntries
          });
          
          // Update state to end_page in Python
          self.pyodide.runPython(`
            old_state = py_script._current_state
            py_script._current_state = 'end_page'
            print("State transition:", old_state, "->", "end_page")
          `);
          
          console.log('[ProcessingWorker] State transition:', currentState, '->', 'end_page');
          
          // Send the converted JavaScript end page command back to the main thread
          self.postMessage({
            eventType: 'runCycleDone',
            scriptEvent: jsEndPageCommand
          });
          return;
        } catch (error) {
          console.error('[ProcessingWorker] [SUBMISSION_TRACKING] Error calling Python render_end_page() from void payload, falling back to JavaScript:', error);
          
          // Fallback: Create end page with donation status set to false
          const endPageCommand = {
            __type__: 'CommandUIRender',
            page: {
              __type__: 'PropsUIPageEnd',
              locale: 'en',
              info: lastEventInfo,
              donated: false  // Default to false when we can't determine from Python
            }
          };
          
          console.log('[ProcessingWorker] Created fallback end page command:', endPageCommand);
          
          // Update state to end_page in Python
          self.pyodide.runPython(`
            old_state = py_script._current_state
            py_script._current_state = 'end_page'
            print("State transition:", old_state, "->", "end_page")
          `);
          
          console.log('[ProcessingWorker] State transition:', currentState, '->', 'end_page');
          
          // Send the fallback end page command back to the main thread
          self.postMessage({
            eventType: 'runCycleDone',
            scriptEvent: endPageCommand
          });
          return;
        }
      }
      
      // Original file input logic (only execute if we didn't show end page)
      console.log('[ProcessingWorker] Received void payload in file_upload state, forcing file input prompt')
      
      // If we're handling a platform selection, this could be the default fallback for a new file upload
      if (currentState === 'splash_screen' || currentState === 'file_input') {
        console.log('[ProcessingWorker] Transitioning from splash screen to file input')
        
        // Get the selected platform from the Python environment - this is crucial!
        let selectedPlatform = 'TikTok' // Default fallback
        try {
          // Try to get from global platform variable first (most reliable)
          selectedPlatform = self.pyodide.runPython(`
            if 'platform' in globals():
              platform
            elif hasattr(py_script, 'platform') and py_script.platform:
              py_script.platform
            else:
              "TikTok"
          `)
          console.log(`[ProcessingWorker] Selected platform from Python globals or py_script: ${selectedPlatform}`)
        } catch (e) {
          console.error('[ProcessingWorker] Error getting platform from Python:', e)
        }
        
        // Create a donation page with embedded file input prompt
        const donationPageCommand = {
          __type__: 'CommandUIRender',
          page: {
            __type__: 'PropsUIPageDonation',
            platform: selectedPlatform,
            locale: 'en',
            header: {
              __type__: 'PropsUIHeader',
              title: {
                translations: {
                  en: `Upload your ${selectedPlatform} data`,
                  nl: `Upload uw ${selectedPlatform}-gegevens`
                }
              }
            },
            body: {
              __type__: 'PropsUIPromptFileInput',
              description: {
                translations: {
                  en: 'Please follow the download instructions and choose the file that you stored on your device.',
                  nl: 'Volg de download instructies en kies het bestand dat u opgeslagen heeft op uw apparaat.'
                }
              },
              extensions: '.zip,.json'
            }
          }
        }
        
        console.log('[ProcessingWorker] Created donation page with file input prompt:', donationPageCommand)
        
        // Update state to file_input in Python
        self.pyodide.runPython(`
          old_state = py_script._current_state
          py_script._current_state = 'file_input'
          print("State transition:", old_state, "->", "file_input")
        `)
        
        console.log('[ProcessingWorker] State transition:', currentState, '->', 'file_input')
        
        // Send the donation page command back to the main thread
        self.postMessage({
          eventType: 'runCycleDone',
          scriptEvent: donationPageCommand
        })
        return
      }
    }

    // Let the Python script handle the payload and generate next command
    console.log('[ProcessingWorker] Sending payload to Python script:', payload.__type__)
    const scriptEvent = pyScript.send(payload)
    console.log('[ProcessingWorker] Script generated next command')
    
    // Log detailed information about the script event
    const eventType = scriptEvent.get('__type__')
    console.log('[ProcessingWorker] Script event type:', eventType)
    
    // Store the last event type for context in the next cycle
    self.lastEventType = eventType;
    
    // Special handling for CommandSystemExit - let Python handle the end page creation
    if (eventType === 'CommandSystemExit') {
      console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Handling exit command, letting Python create end page');
      
      // Extract submission info if available
      const exitCode = scriptEvent.get('code');
      const exitInfo = scriptEvent.get('info') || '';
      console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Exit details:', {
        code: exitCode,
        info: exitInfo,
        infoType: typeof exitInfo,
        timestamp: new Date().toISOString()
      });
      
      // Store the info for later use
      self.lastEventInfo = exitInfo;
      console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Stored exit info for later use:', exitInfo);
      
      // Let Python's render_end_page() function handle the end page creation
      // This ensures donation status is properly tracked
      try {
        console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Calling Python render_end_page()');
        const endPageCommand = self.pyodide.runPython(`
          # Import the render_end_page function and call it
          from script import render_end_page
          end_page_cmd = render_end_page()
          end_page_cmd.toDict()
        `);
        
        console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Python created end page command:', endPageCommand);
        
        // Update state to end_page in Python
        self.pyodide.runPython(`
          old_state = py_script._current_state
          py_script._current_state = 'end_page'
          print("State transition:", old_state, "->", "end_page")
        `);
        
        console.log('[ProcessingWorker] State transition:', currentState, '->', 'end_page');
        
        // Send the Python-generated end page command back to the main thread
        console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Sending Python-generated end page command to main thread');
        self.postMessage({
          eventType: 'runCycleDone',
          scriptEvent: endPageCommand
        });
        return;
      } catch (error) {
        console.error('[ProcessingWorker] [SUBMISSION_TRACKING] Error calling Python render_end_page(), falling back to JavaScript:', error);
        
        // Fallback to JavaScript-generated end page if Python fails
        const endPageCommand = {
          __type__: 'CommandUIRender',
          page: {
            __type__: 'PropsUIPageEnd',
            locale: 'en',
            info: exitInfo,
            donated: false  // Default to false when we can't determine from Python
          }
        };
        
        console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Created fallback end page command with info:', exitInfo);
        
        // Update state to end_page in Python
        self.pyodide.runPython(`
          old_state = py_script._current_state
          py_script._current_state = 'end_page'
          print("State transition:", old_state, "->", "end_page")
        `);
        
        console.log('[ProcessingWorker] State transition:', currentState, '->', 'end_page');
        
        // Send the fallback end page command back to the main thread
        console.log('[ProcessingWorker] [SUBMISSION_TRACKING] Sending fallback end page command to main thread');
        self.postMessage({
          eventType: 'runCycleDone',
          scriptEvent: endPageCommand
        });
        return;
      }
    }
    
    // Detailed logging for UI render commands
    if (eventType === 'CommandUIRender') {
      // Check if it's a page or a prompt
      if (scriptEvent.get('page')) {
        const pageObj = scriptEvent.get('page')
        const pageType = pageObj.get('__type__')
        console.log('[ProcessingWorker] Page type:', pageType)
        
        // Update state based on the page type
        let nextState = currentState
        if (pageType === 'PropsUIPageSplashScreen') {
          nextState = 'splash_screen'
        } else if (pageType === 'PropsUIPageDonation') {
          nextState = 'file_upload'
        } else if (pageType === 'PropsUIPageConsent') {
          nextState = 'donation_screen'
        } else if (pageType === 'PropsUIPageEnd') {
          nextState = 'end'
        }
        
        // Update the state in Python
        self.pyodide.runPython(`
          old_state = py_script._current_state
          py_script._current_state = '${nextState}'
          print("State transition:", old_state, "->", "${nextState}")
        `)
        
        console.log('[ProcessingWorker] State transition:', currentState, '->', nextState)
      } else if (scriptEvent.get('prompt')) {
        const promptObj = scriptEvent.get('prompt')
        const promptType = promptObj.get('__type__')
        console.log('[ProcessingWorker] Prompt type:', promptType)
        
        // Handle file input prompt specifically
        if (promptType === 'PropsUIPromptFileInput') {
          console.log('[ProcessingWorker] File input prompt detected')
          
          // Update state to file_input
          self.pyodide.runPython(`
            old_state = py_script._current_state
            py_script._current_state = 'file_input'
            print("State transition:", old_state, "->", "file_input")
          `)
          
          console.log('[ProcessingWorker] State transition:', currentState, '->', 'file_input')
        }
      }
    }
    
    // Send the command back to the main thread
    self.postMessage({
      eventType: 'runCycleDone',
      scriptEvent: scriptEvent.toJs({
        create_proxies: false,
        dict_converter: Object.fromEntries
      })
    })
  } catch (error) {
    console.error('[ProcessingWorker] Error in runCycle:', error)
    self.postMessage({
      eventType: 'runCycleFailed',
      error: error.toString()
    })
    throw error
  }
}

function unwrap(response) {
  return new Promise((resolve) => {
    switch (response.payload.__type__) {
      case 'PayloadFile':
        copyFileToPyFS(response.payload.value, resolve)
        break

      default:
        resolve(response.payload)
    }
  })
}

function copyFileToPyFS(file, resolve) {
  directoryName = `/file-input`
  pathStats = self.pyodide.FS.analyzePath(directoryName)
  if (!pathStats.exists) {
    self.pyodide.FS.mkdir(directoryName)
  } else {
    self.pyodide.FS.unmount(directoryName)
  }
  self.pyodide.FS.mount(
    self.pyodide.FS.filesystems.WORKERFS,
    {
      files: [file]
    },
    directoryName
  )
  resolve({ __type__: 'PayloadString', value: directoryName + '/' + file.name })
}

function initialise() {
  console.log('[ProcessingWorker] Starting Pyodide initialization')
  return startPyodide()
    .then((pyodide) => {
      console.log('[ProcessingWorker] Pyodide loaded successfully')
      self.pyodide = pyodide
      console.log('[ProcessingWorker] Starting to load required packages')
      return loadPackages()
    })
    .then(() => {
      console.log('[ProcessingWorker] Packages loaded successfully, installing port package')
      return installPortPackage()
    })
    .then(() => {
      console.log('[ProcessingWorker] Port package installed successfully')
    })
    .catch((error) => {
      console.error('[ProcessingWorker] Pyodide initialization failed:', error)
      self.postMessage({
        eventType: 'initialiseFailed',
        error: error.toString()
      })
      throw error // Re-throw to prevent silent failures
    })
}

function startPyodide() {
  console.log('[ProcessingWorker] Importing Pyodide scripts')
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.0/full/pyodide.js')

  console.log('[ProcessingWorker] Starting Pyodide loading process')
  return loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.0/full/'
  }).then(pyodide => {
    console.log('[ProcessingWorker] Pyodide loaded with version:', pyodide.version)
    return pyodide
  })
}

function loadPackages() {
  console.log('[ProcessingWorker] Loading Python packages: micropip, numpy, pandas')
  return self.pyodide.loadPackage(['micropip', 'numpy', 'pandas'])
    .then(() => {
      console.log('[ProcessingWorker] Python packages loaded successfully')
    })
    .catch(error => {
      console.error('[ProcessingWorker] Failed to load packages:', error)
      throw error
    })
}

function installPortPackage() {
  console.log('[ProcessingWorker] Installing port package')
  // Try to load from URL first, then fallback to local file
  const wheelUrl = self.location.origin + '/port-0.0.0-py3-none-any.whl'
  console.log('[ProcessingWorker] Attempting to install from:', wheelUrl)
  
  return self.pyodide.runPythonAsync(`
    import micropip
    import os
    import sys
    
    print("Python version:", sys.version)
    print("Current working directory:", os.getcwd())
    print("Files in current directory:", os.listdir())
    print("Files in /:", os.listdir("/"))
    
    try:
        # Try loading from URL first
        print("Attempting to install from URL:", "${wheelUrl}")
        await micropip.install("${wheelUrl}", deps=False, keep_going=True)
    except Exception as url_error:
        print("Failed to install from URL:", str(url_error))
        try:
            # Fallback to local file
            print("Attempting to install from local file...")
            await micropip.install("/port-0.0.0-py3-none-any.whl", deps=False, keep_going=True)
        except Exception as local_error:
            print("Failed to install from local file:", str(local_error))
            print("Python path:", sys.path)
            print("Available packages:", [pkg for pkg in sys.modules.keys()])
            raise local_error
    
    try:
        import port
        print("Port package imported successfully")
        print("Port package location:", port.__file__)
    except ImportError as import_error:
        print("Failed to import port package:", str(import_error))
        raise import_error
  `).catch(error => {
    console.error('[ProcessingWorker] Failed to install port package:', error)
    throw error
  })
}
