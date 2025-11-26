import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AppState } from './types';
import type { InvoiceData } from './types';
import MasterUploader from './components/MasterUploader';
import ImageUploader from './components/ImageUploader';
import InvoiceDisplay from './components/InvoiceDisplay';
import DataForm, { DataFormHandle } from './components/DataForm';
import Spinner from './components/Spinner';
import { LogoIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, CheckCircleIcon } from './components/icons';
import ResizablePanels from './components/ResizablePanels';

// Nuestros nuevos hooks de lógica y estado
import { useAppContext } from './context/AppContext';
import { useAppLogic } from './context/useAppLogic';

const App: React.FC = () => {
  // Obtenemos el estado desde el contexto
  const {
    appState, masterData, batchData, processedFiles, failedFiles,
    currentIndex, processingStatus, error,
    setAppState, setBatchData, setCurrentIndex
  } = useAppContext();
  
  // Obtenemos las funciones de lógica desde el hook
  const {
    handleMasterDataLoad, handleFilesUpload, handleFullReset, handleResetBatch
  } = useAppLogic();

  const [isAppReady, setIsAppReady] = useState(false);
  const dataFormRef = useRef<DataFormHandle>(null);

  useEffect(() => {
    // La lógica de cargar desde localStorage ya está en el Context
    // Solo necesitamos saber cuándo el masterData está listo
    if (masterData !== null || appState === AppState.AWAITING_MASTER_DATA) {
      setIsAppReady(true);
    }
  }, [masterData, appState]);

  const handleUpdateInvoiceData = (updatedData: InvoiceData) => {
    setBatchData(batchData.map((invoice, index) => (index === currentIndex ? updatedData : invoice)));
  };
  
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
    dataFormRef.current?.save();
    
    setBatchData(currentBatchData => {
        if (currentBatchData.length === 0) return currentBatchData;
        const headers = ['Numero_Factura', 'Fecha_Factura', 'Fecha_Registro', 'Cod_Producto', 'Cantidad_Final', 'Precio_Final', 'Importe_Final'];
        const today = new Date().toISOString().split('T')[0];
        const allRows = currentBatchData.flatMap(invoice =>
            (invoice.items || [])
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
          <div className="flex flex-col w-full h-full">
            <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-between mb-6 pb-6 border-b border-slate-200 gap-4">
              <div className="flex items-center gap-4">
                <button onClick={handlePrev} disabled={currentIndex === 0} className="p-2 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50 transition-colors">
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span className="font-medium text-slate-700 text-lg">
                  Factura {currentIndex + 1} <span className="text-slate-500">de</span> {batchData.length}
                </span>
                <button onClick={handleNext} disabled={currentIndex === batchData.length - 1} className="p-2 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50 transition-colors">
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
              {appState === AppState.EXPORTED ? (
                <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold">
                  <CheckCircleIcon className="h-5 w-5" />
                  <span>¡Exportación Exitosa!</span>
                </div>
              ) : (
                 <button onClick={exportAllToCsv} className="px-6 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 flex items-center gap-2 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                    <DownloadIcon className="w-5 h-5"/>
                    Exportar Todo a CSV
                 </button>
              )}
            </div>
            {failedFiles.length > 0 && (
                <div className="flex-shrink-0 bg-amber-100 border-l-4 border-amber-500 text-amber-800 p-4 rounded-md mb-4">
                    <p className="font-bold">Aviso de Procesamiento</p>
                    <p>{failedFiles.length} documento(s) no pudieron ser procesados y fueron omitidos:</p>
                    <ul className="list-disc list-inside text-sm mt-2">
                      {failedFiles.map((file, index) => (
                          <li key={index}>
                              <strong>{file.name}:</strong> {file.reason}
                          </li>
                      ))}
                    </ul>
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
            <h2 className="text-3xl font-bold text-red-600 mb-4">Ocurrió un Error</h2>
            <p className="text-slate-700 bg-red-100 p-4 rounded-lg max-w-xl">{error}</p>
            {failedFiles.length > 0 && (
              <div className="mt-6 text-left bg-slate-100 p-4 rounded-lg w-full max-w-xl">
                <p className="font-semibold mb-2 text-slate-800">Detalles de archivos fallidos:</p>
                <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                  {failedFiles.map(f => <li key={f.name}><strong>{f.name}:</strong> {f.reason}</li>)}
                </ul>
              </div>
            )}
            <button
              onClick={handleFullReset}
              className="mt-8 px-8 py-3 bg-violet-600 text-white font-semibold rounded-full hover:bg-violet-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Empezar de Nuevo
            </button>
          </div>
        );
      default:
        return <ImageUploader onFilesUpload={handleFilesUpload} disabled={false} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col antialiased bg-slate-100 text-slate-800">
      <header className="p-4 border-b border-slate-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LogoIcon className="h-8 w-8 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-800">Factura OCR AI</h1>
          </div>
          { (appState !== AppState.AWAITING_MASTER_DATA && appState !== AppState.IDLE) && (
            <div className="flex items-center gap-3">
              <button onClick={handleResetBatch} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 text-sm transition-colors">
                Iniciar Nuevo Lote
              </button>
              <button onClick={handleFullReset} className="px-4 py-2 bg-amber-200 text-amber-900 font-semibold rounded-lg hover:bg-amber-300 text-sm transition-colors">
                Actualizar Base de Datos
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex-grow container mx-auto flex items-center justify-center p-4">
        <div className="w-full h-full max-w-7xl bg-white rounded-2xl shadow-lg p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;