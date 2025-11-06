import { useCallback, useMemo } from 'react';
import { useAppContext } from './AppContext';
import { processSingleFile, processInChunks } from '../services/apiService';
import { findBestMatch } from '../utils/stringMatcher';
import type { InvoiceData, LineItem, MasterDatabase } from '../types';
import { AppState } from '../types';

export const useAppLogic = () => {
  const context = useAppContext();
  const {
    masterData,
    setMasterData,
    setAppState,
    setError,
    setProcessingStatus,
    setBatchData,
    setProcessedFiles,
    setFailedFiles,
    setCurrentIndex,
  } = context;

  const handleMasterDataLoad = useCallback((data: MasterDatabase) => {
    setMasterData(data);
    try {
      const serializableData = [...data.entries()];
      localStorage.setItem('masterDatabase', JSON.stringify(serializableData));
    } catch (error) {
      console.error("Failed to save master database to localStorage", error);
    }
    setAppState(AppState.IDLE);
  }, [setMasterData, setAppState]);

  const handleFilesUpload = useCallback(async (files: File[]) => {
    if (!masterData) {
      setError("La base de datos maestra no está cargada.");
      setAppState(AppState.ERROR);
      return;
    }

    setAppState(AppState.PROCESSING);
    setError(null);
    setProcessingStatus(`Procesando ${files.length} documentos...`);

    const processAndMapFile = async (file: File) => {
      const result = await processSingleFile(file);
      
      if (!result.success) {
        return { success: false, file, reason: result.reason };
      }

      try {
        const ocrData = result.data;
        const normalizedCuit = (ocrData.cuit || '').replace(/-/g, '');
        let identifiedSupplierCuit: string | undefined;

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
            matchScore: 0
          };
          if (supplierInfo) {
            const bestMatch = findBestMatch(
                ocrItem.description, 
                supplierInfo.products, 
                (p: { productCode: string; productName: string }) => p.productName
            );
            if (bestMatch) {
              return { ...defaultItem, 
                productCode: bestMatch.bestMatch.productCode, 
                productName: bestMatch.bestMatch.productName,
                matchScore: bestMatch.score, 
              };
            }
          }
          return defaultItem;
        });
        
        const finalInvoiceData: InvoiceData = { ...ocrData, items: matchedItems, identifiedSupplierCuit, usePreloadedCatalog: false };
        return { success: true, file, data: finalInvoiceData };
      } catch (mapError) {
          console.error(`Falló el mapeo del archivo '${file.name}'. Razón:`, mapError);
          const reason = mapError instanceof Error ? mapError.message : 'Error al mapear datos';
          return { success: false, file, reason };
      }
    };

    const CHUNK_SIZE = 5; 
    const results = await processInChunks(files, CHUNK_SIZE, processAndMapFile);

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
  }, [masterData, setAppState, setError, setProcessingStatus, setBatchData, setProcessedFiles, setFailedFiles, setCurrentIndex]);

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
  }, [setBatchData, setProcessedFiles, setFailedFiles, setCurrentIndex, setProcessingStatus, setError, setMasterData, setAppState]);

  const handleResetBatch = useCallback(() => {
    setBatchData([]);
    setProcessedFiles([]);
    setFailedFiles([]);
    setCurrentIndex(0);
    setProcessingStatus(null);
    setError(null);
    setAppState(AppState.IDLE);
  }, [setBatchData, setProcessedFiles, setFailedFiles, setCurrentIndex, setProcessingStatus, setError, setAppState]);

  return {
    handleMasterDataLoad,
    handleFilesUpload,
    handleFullReset,
    handleResetBatch
  };
};