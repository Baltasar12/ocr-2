// context/useAppLogic.test.tsx
import React from 'react';
import { render, act } from '@testing-library/react'; // Importar render, no renderHook
import { useAppLogic } from './useAppLogic';
import { useAppContext, AppProvider } from './AppContext';
import { AppState } from '../types';
import type { MasterDatabase } from '../types';
import * as apiService from '../services/apiService';

// 1. Mockear el API Service
jest.mock('../services/apiService');
const mockedApiService = apiService as jest.Mocked<typeof apiService>;

// 2. El "componente arnés" (Test Harness)
// Este componente nos permite acceder a los hooks desde la prueba
// bajo un MISMO provider.
let logicHook: any;
let stateHook: any;
const TestHarness: React.FC = () => {
  logicHook = useAppLogic();
  stateHook = useAppContext();
  return null; // No necesitamos renderizar nada
};

// 3. El wrapper que usará render
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AppProvider>{children}</AppProvider>
);

describe('useAppLogic', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- PRUEBA 1 (CORREGIDA) ---
  test('handleMasterDataLoad debería actualizar masterData y cambiar el estado a IDLE', () => {
    // 4. Renderizar el Arnés DENTRO del Provider
    render(<TestHarness />, { wrapper });

    // Estado inicial (leído desde stateHook)
    expect(stateHook.appState).toBe(AppState.AWAITING_MASTER_DATA);

    const mockDb: MasterDatabase = new Map([
      ['30-123-9', { supplierCode: 'P1', supplierName: 'Prov 1', products: [] }]
    ]);

    // Actuar (usando logicHook)
    act(() => {
      logicHook.handleMasterDataLoad(mockDb);
    });

    // Verificar (leyendo desde stateHook)
    // ¡Ahora sí funciona!
    expect(stateHook.masterData).toBe(mockDb);
    expect(stateHook.appState).toBe(AppState.IDLE);
  });

  // --- PRUEBA 2 (CORREGIDA) ---
  test('handleFilesUpload debería procesar archivos, mapearlos y cambiar el estado a REVIEWING', async () => {
    render(<TestHarness />, { wrapper });

    // -- Preparación --
    const mockDb: MasterDatabase = new Map([
      ['30-111-1', { supplierCode: 'P1', supplierName: 'Proveedor 1', products: [
        { productCode: 'C100', productName: 'Coca-Cola' }
      ]}]
    ]);
    act(() => {
      logicHook.handleMasterDataLoad(mockDb);
    });

    // 5. Mockear AMBAS funciones del apiService
    const mockFileData = {
      success: true,
      file: new File([''], 'factura.jpg'),
      data: {
        cuit: '30-111-1',
        invoiceNumber: '123-OK',
        items: [{ description: 'Coca-Co', quantity: 2, unitPrice: 100, total: 200 }]
      }
    };
    mockedApiService.processSingleFile.mockResolvedValue(mockFileData);
    
    // AQUÍ LA CORRECCIÓN CLAVE: Mockeamos processInChunks
    // Le decimos que simplemente llame al procesador por cada item.
    mockedApiService.processInChunks.mockImplementation(async (files, chunkSize, processor) => {
      return Promise.all(files.map(processor));
    });

    const mockFile = new File([''], 'factura.jpg', { type: 'image/jpeg' });

    // -- Ejecución --
    await act(async () => {
      await logicHook.handleFilesUpload([mockFile]);
    });

    // -- Verificación --
    expect(stateHook.appState).toBe(AppState.REVIEWING);
    expect(stateHook.processedFiles).toHaveLength(1);
    expect(stateHook.failedFiles).toHaveLength(0);
    expect(stateHook.batchData[0].items[0].productName).toBe('Coca-Cola');
  });

  // --- PRUEBA 3 (CORREGIDA) ---
  test('handleFilesUpload debería manejar archivos fallidos', async () => {
    render(<TestHarness />, { wrapper });

    // 1. Cargar MasterData
    act(() => {
      logicHook.handleMasterDataLoad(new Map());
    });

    // 2. Mockear para que falle
    const mockFailureData = {
      success: false,
      file: new File([''], 'fallo.jpg'),
      reason: 'API Error'
    };
    mockedApiService.processSingleFile.mockResolvedValue(mockFailureData);
    
    // Mockeamos processInChunks (igual que antes)
    mockedApiService.processInChunks.mockImplementation(async (files, chunkSize, processor) => {
      return Promise.all(files.map(processor));
    });

    const mockFile = new File([''], 'fallo.jpg', { type: 'image/jpeg' });

    // -- Ejecución --
    await act(async () => {
      await logicHook.handleFilesUpload([mockFile]);
    });

    // -- Verificación --
    expect(stateHook.appState).toBe(AppState.ERROR);
    expect(stateHook.failedFiles).toHaveLength(1);
    expect(stateHook.failedFiles[0].reason).toBe('API Error');
  });
});