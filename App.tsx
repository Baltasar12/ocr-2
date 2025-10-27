
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { extractInvoiceData } from './services/geminiService';
import type { InvoiceData, LineItem, MasterDatabase } from './types';
import { AppState } from './types';
import MasterUploader from './components/MasterUploader';
import ImageUploader from './components/ImageUploader';
import InvoiceDisplay from './components/InvoiceDisplay';
import DataForm, { DataFormHandle } from './components/DataForm';
import Spinner from './components/Spinner';
import { findBestMatch } from './utils/stringMatcher';
import { LogoIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, CheckCircleIcon } from './components/icons';
import { isPdfTextBased, extractTextFromPdf } from './services/pdfUtils';
import ResizablePanels from './components/ResizablePanels';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.AWAITING_MASTER_DATA);
  const [masterData, setMasterData] = useState<MasterDatabase | null>(null);
  const [batchData, setBatchData] = useState<InvoiceData[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [failedFiles, setFailedFiles] = useState<{ name: string; reason: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processingFileCount, setProcessingFileCount] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAppReady, setIsAppReady] = useState(false);
  const dataFormRef = useRef<DataFormHandle>(null);

  useEffect(() => {
    try {
      const storedDb = localStorage.getItem('masterDatabase');
      if (storedDb) {
        const parsedDb = JSON.parse(storedDb);
        const dbMap: MasterDatabase = new Map(parsedDb);
        if (dbMap.size > 0) {
          setMasterData(dbMap);
          setAppState(AppState.IDLE);
        }
      }
    } catch (e) {
      console.error("Failed to load master database from localStorage", e);
      localStorage.removeItem('masterDatabase');
    } finally {
      setIsAppReady(true);
    }
  }, []);

  const handleMasterDataLoad = useCallback((data: MasterDatabase) => {
    setMasterData(data);
    try {
        const serializableData = [...data.entries()];
        localStorage.setItem('masterDatabase', JSON.stringify(serializableData));
    } catch (error) {
        console.error("Failed to save master database to localStorage", error);
    }
    setAppState(AppState.IDLE);
  }, []);

  const handleFilesUpload = useCallback(async (files: File[]) => {
    if (!masterData) {
      setError("Master product database is not loaded.");
      setAppState(AppState.ERROR);
      return;
    }

    setProcessingFileCount(files.length);
    setAppState(AppState.PROCESSING);
    setError(null);
    setProcessingStatus(null);

    const successfulInvoices: InvoiceData[] = [];
    const successfulFiles: File[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const [index, file] of files.entries()) {
      setProcessingStatus(`Procesando factura ${index + 1} de ${files.length}...`);
      try {
        let ocrData;
        if (file.type === 'application/pdf') {
          const isText = await isPdfTextBased(file);
          if (isText) {
            console.log(`[Router] File ${file.name} is a text-based PDF. Extracting text.`);
            const text = await extractTextFromPdf(file);
            ocrData = await extractInvoiceData(text);
          } else {
            console.log(`[Router] File ${file.name} is an image-based PDF. Sending for OCR.`);
            ocrData = await extractInvoiceData(file);
          }
        } else {
          console.log(`[Router] File ${file.name} is an image. Sending for OCR.`);
          ocrData = await extractInvoiceData(file);
        }

        const normalizedCuit = ocrData.cuit.replace(/-/g, '');
        let identifiedSupplierCuit: string | undefined = undefined;

        for (const [keyCuit] of masterData.entries()) {
          if (keyCuit.replace(/-/g, '') === normalizedCuit) {
            identifiedSupplierCuit = keyCuit;
            break;
          }
        }

        const supplierInfo = identifiedSupplierCuit ? masterData.get(identifiedSupplierCuit) : undefined;

        const matchedItems: LineItem[] = ocrData.items.map((ocrItem, itemIndex) => {
          const defaultItem = {
            id: `item-${Date.now()}-${itemIndex}`,
            ocrDescription: ocrItem.description,
            ocrQuantity: ocrItem.quantity,
            ocrUnitPrice: ocrItem.unitPrice,
            productCode: '',
            productName: 'N/A',
            quantity: ocrItem.quantity,
            unitPrice: ocrItem.unitPrice,
            total: ocrItem.total,
          };

          if (supplierInfo) {
            const productCandidates: { productCode: string; productName: string }[] = supplierInfo.products;
            const bestMatch = findBestMatch(ocrItem.description, productCandidates, p => p.productName);
            if (bestMatch) {
              return {
                ...defaultItem,
                productCode: bestMatch.bestMatch.productCode,
                productName: bestMatch.bestMatch.productName,
              };
            }
          }
          return defaultItem;
        });

        successfulInvoices.push({ ...ocrData, items: matchedItems, identifiedSupplierCuit, usePreloadedCatalog: false });
        successfulFiles.push(file);

      } catch (error) {
        failed.push({
          name: file.name,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    setProcessingStatus(null);
    setBatchData(successfulInvoices);
    setProcessedFiles(successfulFiles);
    setFailedFiles(failed);

    if (successfulInvoices.length > 0) {
      setCurrentIndex(0);
      setAppState(AppState.REVIEWING);
    } else {
      setError(`Failed to process all ${files.length} documents.`);
      setAppState(AppState.ERROR);
    }
  }, [masterData]);

  const handleFullReset = useCallback(() => {
    setBatchData([]);
    setProcessedFiles([]);
    setFailedFiles([]);
    setCurrentIndex(0);
    setProcessingFileCount(0);
    setProcessingStatus(null);
    setError(null);
    setMasterData(null);
    localStorage.removeItem('masterDatabase');
    setAppState(AppState.AWAITING_MASTER_DATA);
  }, []);

  const handleResetBatch = useCallback(() => {
    setBatchData([]);
    setProcessedFiles([]);
    setFailedFiles([]);
    setCurrentIndex(0);
    setProcessingFileCount(0);
    setProcessingStatus(null);
    setError(null);
    setAppState(AppState.IDLE);
  }, []);
  
  const handleUpdateInvoiceData = useCallback((updatedData: InvoiceData) => {
    setBatchData(prev => 
      prev.map((invoice, index) => index === currentIndex ? updatedData : invoice)
    );
  }, [currentIndex]);
  
  const handleNext = () => {
    dataFormRef.current?.save();
    if (currentIndex < batchData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    dataFormRef.current?.save();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const exportAllToCsv = () => {
    // 1. Guardar explícitamente el estado actual del formulario
    // Esto llama a onDataChange y actualiza el estado 'batchData' de React.
    if (dataFormRef.current) {
        dataFormRef.current.save();
    }

    // 2. Usar una función de callback con setBatchData para garantizar que usamos el estado más reciente
    setBatchData(currentBatchData => {
        
        // 3. Ahora 'currentBatchData' es la versión más fresca y segura del estado
        if (currentBatchData.length === 0) return currentBatchData;

        const headers = ['Numero_Factura', 'Fecha_Factura', 'Fecha_Registro', 'Cod_Producto', 'Cantidad_Final', 'Precio_Final', 'Importe_Final'];
        const today = new Date().toISOString().split('T')[0];

        const allRows = currentBatchData.flatMap(invoice =>
            invoice.items
                .filter(item => item.productCode && item.quantity > 0)
                .map(item => [
                    invoice.invoiceNumber,
                    invoice.invoiceDate,
                    today,
                    item.productCode,
                    item.quantity,
                    item.unitPrice,
                    item.total,
                ].join(','))
        );

        if (allRows.length === 0) {
            alert("No valid items to export. Please ensure products are mapped and quantities are greater than zero.");
            return currentBatchData; // Devuelve el estado sin cambios
        }

        const csvContent = [headers.join(','), ...allRows].join('\n');
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.setAttribute('download', `facturas_export_${timestamp}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Actualizar el estado de la aplicación para mostrar el mensaje de éxito
        setAppState(AppState.EXPORTED);
        
        return currentBatchData; // Devuelve el estado sin cambios
    });
  };

  const currentInvoice = useMemo(() => batchData[currentIndex], [batchData, currentIndex]);
  const currentFile = useMemo(() => processedFiles[currentIndex], [processedFiles, currentIndex]);

  const renderContent = () => {
    if (!isAppReady) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <Spinner />
          <p className="text-slate-600 mt-4 text-lg">Inicializando aplicación...</p>
        </div>
      );
    }

    switch (appState) {
      case AppState.AWAITING_MASTER_DATA:
        return <MasterUploader onLoad={handleMasterDataLoad} />;
      case AppState.PROCESSING:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Spinner />
            <p className="text-slate-600 mt-4 text-lg">
              {processingStatus || `Analizando ${processingFileCount} documentos...`}
            </p>
            <p className="text-slate-500 mt-1">Esto puede tomar unos momentos. ¡La IA está haciendo su magia!</p>
          </div>
        );
      case AppState.REVIEWING:
      case AppState.EXPORTED:
        if (!currentInvoice || !masterData) return null;
        return (
          <div className="flex flex-col w-full h-full p-4 md:p-8">
            <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-between mb-4 pb-4 border-b border-slate-200 gap-4">
              <div className="flex items-center gap-4">
                <button onClick={handlePrev} disabled={currentIndex === 0} className="p-2 rounded-md bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span className="font-medium text-slate-700 whitespace-nowrap">
                  Factura {currentIndex + 1} de {batchData.length}
                </span>
                <button onClick={handleNext} disabled={currentIndex === batchData.length - 1} className="p-2 rounded-md bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
              {appState === AppState.EXPORTED ? (
                <div className="bg-green-100 text-green-800 px-4 py-2 rounded-md flex items-center gap-2 text-sm font-semibold">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span>¡Exportación Exitosa!</span>
                </div>
              ) : (
                 <button
                    onClick={exportAllToCsv}
                    className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                 >
                    <DownloadIcon className="w-5 h-5"/>
                    Exportar Todo a CSV
                 </button>
              )}
            </div>

            {failedFiles.length > 0 && (
                <div className="flex-shrink-0 bg-amber-100 border-l-4 border-amber-500 text-amber-800 p-4 rounded-md mb-4">
                    <p className="font-bold">Aviso de Procesamiento</p>
                    <p>{failedFiles.length} documento(s) no pudieron ser procesados y fueron omitidos.</p>
                </div>
            )}
             
            <div className="flex-grow min-h-0">
               <ResizablePanels
                  leftPanel={<InvoiceDisplay file={currentFile} />}
                  rightPanel={<DataForm ref={dataFormRef} data={currentInvoice} onDataChange={handleUpdateInvoiceData} masterData={masterData} />}
                  initialRightPanelWidth={66.66}
               />
            </div>
          </div>
        );
      case AppState.ERROR:
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Ocurrió un Error</h2>
            <p className="text-slate-700 bg-red-100 p-4 rounded-lg">{error}</p>
            {failedFiles.length > 0 && (
              <div className="mt-4 text-left bg-slate-100 p-4 rounded-md w-full max-w-md">
                <p className="font-semibold mb-2">Detalles:</p>
                <ul className="list-disc list-inside text-sm text-slate-600">
                  {failedFiles.map(f => <li key={f.name}><strong>{f.name}:</strong> {f.reason}</li>)}
                </ul>
              </div>
            )}
            <button
              onClick={handleFullReset}
              className="mt-6 px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 transition-colors"
            >
              Empezar de Nuevo
            </button>
          </div>
        );
      case AppState.IDLE:
      default:
        return <ImageUploader onFilesUpload={handleFilesUpload} disabled={false} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col antialiased text-slate-800">
      <header className="p-4 border-b border-slate-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
                <LogoIcon className="h-8 w-8 text-indigo-600" />
                <h1 className="text-2xl font-bold text-slate-800">Factura OCR AI</h1>
            </div>
             { (appState !== AppState.AWAITING_MASTER_DATA && appState !== AppState.IDLE) && (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleResetBatch} 
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-md hover:bg-slate-200 transition-colors text-sm"
                  >
                      Iniciar Nuevo Lote
                  </button>
                   <button 
                    onClick={handleFullReset} 
                    className="px-4 py-2 bg-amber-100 text-amber-800 font-semibold rounded-md hover:bg-amber-200 transition-colors text-sm"
                  >
                      Actualizar Base de Datos
                  </button>
                </div>
             )}
        </div>
      </header>
      <main className="flex-grow container mx-auto flex items-center justify-center">
        <div className="w-full h-full max-w-7xl">
           {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
