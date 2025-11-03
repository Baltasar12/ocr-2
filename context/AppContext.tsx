import React, { createContext, useState, useContext, ReactNode } from 'react';
import type { InvoiceData, MasterDatabase } from '../types';
import { AppState } from '../types';

interface AppContextState {
  appState: AppState;
  masterData: MasterDatabase | null;
  batchData: InvoiceData[];
  processedFiles: File[];
  failedFiles: { name: string; reason: string }[];
  currentIndex: number;
  processingStatus: string | null;
  error: string | null;
  
  // Setters
  setAppState: (state: AppState) => void;
  setMasterData: (data: MasterDatabase | null) => void;
  setBatchData: (data: InvoiceData[]) => void;
  setProcessedFiles: (files: File[]) => void;
  setFailedFiles: (files: { name: string; reason: string }[]) => void;
  setCurrentIndex: (index: number) => void;
  setProcessingStatus: (status: string | null) => void;
  setError: (error: string | null) => void;
}

const AppContext = createContext<AppContextState | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [appState, setAppState] = useState<AppState>(AppState.AWAITING_MASTER_DATA);
  const [masterData, setMasterData] = useState<MasterDatabase | null>(null);
  const [batchData, setBatchData] = useState<InvoiceData[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [failedFiles, setFailedFiles] = useState<{ name: string; reason: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const value = {
    appState, setAppState,
    masterData, setMasterData,
    batchData, setBatchData,
    processedFiles, setProcessedFiles,
    failedFiles, setFailedFiles,
    currentIndex, setCurrentIndex,
    processingStatus, setProcessingStatus,
    error, setError
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext debe ser usado dentro de un AppProvider');
  }
  return context;
};