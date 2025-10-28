import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { InvoiceData, LineItem, MasterDatabase } from './types';
import { AppState } from './types';
import MasterUploader from './components/MasterUploader';
import ImageUploader from './components/ImageUploader';
import InvoiceDisplay from './components/InvoiceDisplay';
import DataForm, { DataFormHandle } from './components/DataForm';
import Spinner from './components/Spinner';
import { findBestMatch } from './utils/stringMatcher';
import { LogoIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, CheckCircleIcon } from './components/icons';
import ResizablePanels from './components/ResizablePanels';

// @ts-nocheck
declare var pdfjsLib: any;

const sanitizePdf = async (file: File): Promise<File> => {
    console.log("Intentando sanitizar PDF:", file.name);
    try {
        const arrayBuffer = await file.arrayBuffer();
        const typedarray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error("No se pudo obtener el contexto del canvas.");

        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, 'image/jpeg', 0.95);
        });

        if (!blob) throw new Error("Fallo al convertir el canvas a blob.");

        const sanitizedFile = new File([blob], `sanitized_${file.name.replace(/\.pdf$/i, '.jpg')}`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
        });

        console.log("Sanitización exitosa.");
        return sanitizedFile;
    } catch (error) {
        // MEJORA: Log más detallado en la consola del navegador
        console.error(`Falló la sanitización del PDF '${file.name}'. Razón:`, error);
        // Devolvemos el archivo original como último recurso.
        return file;
    }
};


const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.AWAITING_MASTER_DATA);
  const [masterData, setMasterData] = useState<MasterDatabase | null>(null);
  const [batchData, setBatchData] = useState<InvoiceData[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [failedFiles, setFailedFiles] = useState<{ name: string; reason: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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
      setError("La base de datos maestra no está cargada.");
      setAppState(AppState.ERROR);
      return;
    }

    setAppState(AppState.PROCESSING);
    setError(null);
    setProcessingStatus(`Preparando y procesando ${files.length} documentos...`);

    const fileProcessingPromises = files.map(async (file) => {
      try {
        let fileToUpload = file;
        if (file.type === 'application/pdf') {
          fileToUpload = await sanitizePdf(file);
        }
          
        const formData = new FormData();
        formData.append('file', fileToUpload);

        const response = await fetch('/api/procesar-factura', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Error del servidor sin JSON.' }));
          throw new Error(errorData.error);
        }

        const ocrData = await response.json();
        
        const normalizedCuit = (ocrData.cuit || '').replace(/-/g, '');
        let identifiedSupplierCuit: string | undefined = undefined;

        for (const [keyCuit] of masterData.entries()) {
          if (keyCuit.replace(/-/g, '') === normalizedCuit) {
            identifiedSupplierCuit = keyCuit;
            break;
          }
        }

        const supplierInfo = identifiedSupplierCuit ? masterData.get(identifiedSupplierCuit) : undefined;
        const matchedItems: LineItem[] = (ocrData.items || []).map((ocrItem: any, itemIndex: number) => {
          const defaultItem = {
            id: `item-${Date.now()}-${itemIndex}`,
            ocrDescription: ocrItem.description, ocrQuantity: ocrItem.quantity, ocrUnitPrice: ocrItem.unitPrice,
            productCode: '', productName: 'N/A',
            quantity: ocrItem.quantity, unitPrice: ocrItem.unitPrice, total: ocrItem.total,
          };
          if (supplierInfo) {
            const bestMatch = findBestMatch(
                ocrItem.description, 
                supplierInfo.products, 
                (p: { productCode: string; productName: string }) => p.productName
            );
            if (bestMatch) {
              return { ...defaultItem, productCode: bestMatch.bestMatch.productCode, productName: bestMatch.bestMatch.productName };
            }
          }
          return defaultItem;
        });
        
        const finalInvoiceData: InvoiceData = { ...ocrData, items: matchedItems, identifiedSupplierCuit, usePreloadedCatalog: false };
        
        return { success: true, file, data: finalInvoiceData };

      } catch (error) {
        // MEJORA: Log del error en la consola del navegador
        console.error(`Falló el procesamiento del archivo '${file.name}'. Razón:`, error);
        const reason = error instanceof Error ? error.message : 'Error desconocido';
        return { success: false, file, reason };
      }
    });

    const results = await Promise.all(fileProcessingPromises);

    const successfulInvoices = results.filter(r => r.success).map(r => r.data as InvoiceData);
    const successfulFiles = results.filter(r => r.success).map(r => r.file);
    const failedFilesResult = results.filter(r => !r.success).map(r => ({ name: r.file.name, reason: r.reason as string }));

    setProcessingStatus(null);
    setBatchData(successfulInvoices);
    setProcessedFiles(successfulFiles);
    setFailedFiles(failedFilesResult);

    if (successfulInvoices.length > 0) {
      setCurrentIndex(0);
      setAppState(AppState.REVIEWING);
    } else {
      setError(`Falló el procesamiento de todos los ${files.length} documentos.`);
      setAppState(AppState.ERROR);
    }
  }, [masterData]);


  // El resto de las funciones (handleFullReset, exportAllToCsv, render, etc.) se mantienen igual...
  // ... (pegar aquí el resto de tu App.tsx sin cambios)
  const handleFullReset = useCallback(() => {
    setBatchData([]);
    setProcessedFiles([]);
    setFailedFiles([]);
    setCurrentIndex(0);
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
    if (dataFormRef.current) {
        dataFormRef.current.save();
    }
    setBatchData(currentBatchData => {
        if (currentBatchData.length === 0) return currentBatchData;
        const headers = ['Numero_Factura', 'Fecha_Factura', 'Fecha_Registro', 'Cod_Producto', 'Cantidad_Final', 'Precio_Final', 'Importe_Final'];
        const today = new Date().toISOString().split('T')[0];
        const allRows = currentBatchData.flatMap(invoice =>
            invoice.items
                .filter(item => item.productCode && item.quantity > 0)
                .map(item => [
                    invoice.invoiceNumber, invoice.invoiceDate, today,
                    item.productCode, item.quantity, item.unitPrice, item.total,
                ].join(','))
        );
        if (allRows.length === 0) {
            alert("No hay items válidos para exportar.");
            return currentBatchData;
        }
        const csvContent = [headers.join(','), ...allRows].join('\n');
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute('download', `facturas_export_${new Date().toISOString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setAppState(AppState.EXPORTED);
        return currentBatchData;
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
            <p className="text-slate-600 mt-4 text-lg">{processingStatus || `Analizando documentos...`}</p>
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
                <button onClick={handlePrev} disabled={currentIndex === 0} className="p-2 rounded-md bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50">
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span className="font-medium text-slate-700">Factura {currentIndex + 1} de {batchData.length}</span>
                <button onClick={handleNext} disabled={currentIndex === batchData.length - 1} className="p-2 rounded-md bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50">
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
              {appState === AppState.EXPORTED ? (
                <div className="bg-green-100 text-green-800 px-4 py-2 rounded-md flex items-center gap-2 text-sm font-semibold">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span>¡Exportación Exitosa!</span>
                </div>
              ) : (
                 <button onClick={exportAllToCsv} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 flex items-center gap-2">
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
                <p className="font-semibold mb-2">Detalles de archivos fallidos:</p>
                <ul className="list-disc list-inside text-sm text-slate-600">
                  {failedFiles.map(f => <li key={f.name}><strong>{f.name}:</strong> {f.reason}</li>)}
                </ul>
              </div>
            )}
            <button onClick={handleFullReset} className="mt-6 px-6 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700">
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
                  <button onClick={handleResetBatch} className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-md hover:bg-slate-200 text-sm">
                      Iniciar Nuevo Lote
                  </button>
                   <button onClick={handleFullReset} className="px-4 py-2 bg-amber-100 text-amber-800 font-semibold rounded-md hover:bg-amber-200 text-sm">
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