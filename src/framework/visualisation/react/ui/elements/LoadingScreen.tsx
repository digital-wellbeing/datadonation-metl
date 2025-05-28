import React, { useState, useEffect } from 'react';
import { Spinner } from './spinner';

interface LoadingScreenProps {
  message?: string;
  isLoading?: boolean;
  showLoadingInfo?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = 'Loading application...',
  isLoading = true,
  showLoadingInfo = true
}) => {
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = [
    "Initializing application...",
    "Loading resources...",
    "Starting Pyodide...",
    "Processing data...",
    "Almost ready..."
  ];

  // Simulate progress for better UX
  useEffect(() => {
    if (!isLoading) return;
    
    const interval = setInterval(() => {
      setLoadingStep(prev => {
        // Don't go past the last step
        if (prev >= loadingSteps.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 2000); // Update every 2 seconds
    
    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <div className="flex flex-col items-center p-8 max-w-md text-center">
        <div className="mb-6 scale-150">
          <Spinner spinning={true} color="dark" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">{message}</h2>
        
        {showLoadingInfo && (
          <>
            <p className="text-md text-gray-600 mb-4">{loadingSteps[loadingStep]}</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
              <div 
                className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${(loadingStep + 1) * (100 / loadingSteps.length)}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500">
              This may take a moment depending on your internet connection
            </p>
          </>
        )}
      </div>
    </div>
  );
}; 