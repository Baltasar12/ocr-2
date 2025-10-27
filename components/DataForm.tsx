import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import type { InvoiceData, LineItem, MasterDatabase } from '../types';
import { TrashIcon } from './icons';
import { findBestMatch } from '../utils/stringMatcher';

export interface DataFormHandle {
  save: () => InvoiceData;
}

interface DataFormProps {
  data: InvoiceData;
  onDataChange: (data: InvoiceData) => void;
  masterData: MasterDatabase;
}

const DataForm = forwardRef<DataFormHandle, DataFormProps>(({ data, onDataChange, masterData }, ref) => {
  const [formData, setFormData] = useState(data);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');

  useEffect(() => {
    setFormData(data);
    if (!data.identifiedSupplierCuit && data.supplierName) {
      setSupplierSearchTerm(data.supplierName);
    } else {
      setSupplierSearchTerm('');
    }
  }, [data]);

  useImperativeHandle(ref, () => ({
    save: () => {
      onDataChange(formData);
      return formData;
    }
  }));

  const suppliers = Array.from(masterData.entries()).map(([cuit, details]) => ({
    cuit,
    name: details.supplierName,
  }));

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name.toLowerCase().includes(supplierSearchTerm.toLowerCase()) ||
    supplier.cuit.toLowerCase().includes(supplierSearchTerm.toLowerCase())
  );

  const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSupplierCuit = e.target.value;
    const newSupplierData = masterData.get(newSupplierCuit);
    if (!newSupplierData) return;
    
    setFormData(prevData => {
      const productCandidates: { productCode: string; productName: string }[] = newSupplierData.products;

      const reMatchedItems = prevData.items.map(item => {
        const bestMatch = findBestMatch(item.ocrDescription, productCandidates, p => p.productName);
        if (bestMatch) {
          return {
            ...item,
            productCode: bestMatch.bestMatch.productCode,
            productName: bestMatch.bestMatch.productName,
          };
        }
        return { ...item, productCode: '', productName: 'N/A' };
      });
      
      return { 
        ...prevData, 
        identifiedSupplierCuit: newSupplierCuit,
        items: reMatchedItems,
        usePreloadedCatalog: false,
      };
    });
  };

  const getPreloadedItems = (supplierCuit: string): LineItem[] => {
    const supplierInfo = masterData.get(supplierCuit);
    if (!supplierInfo) return [];

    return supplierInfo.products.map((p, index) => ({
      id: `item-preloaded-${Date.now()}-${index}`,
      ocrDescription: '',
      ocrQuantity: 0,
      ocrUnitPrice: 0,
      productCode: p.productCode,
      productName: p.productName,
      quantity: 0,
      unitPrice: 0,
      total: 0,
    }));
  };
  
  const handlePreloadToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const usePreloaded = e.target.checked;
    setFormData(prevData => {
        if (usePreloaded && prevData.identifiedSupplierCuit) {
            const itemsToBackup = prevData.items;
            const preloadedItems = getPreloadedItems(prevData.identifiedSupplierCuit);
            return {
                ...prevData,
                usePreloadedCatalog: true,
                items: preloadedItems,
                originalItems: itemsToBackup,
            };
        } else {
            const itemsToRestore = prevData.originalItems || prevData.items;
            return {
                ...prevData,
                usePreloadedCatalog: false,
                items: itemsToRestore,
                originalItems: undefined,
            };
        }
    });
  };


  const handleItemChange = (id: string, field: keyof Omit<LineItem, 'id'>, value: string) => {
    setFormData(prevData => {
        const newItems = prevData.items.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };
                if (field === 'quantity' || field === 'unitPrice') {
                    const quantity = field === 'quantity' ? Number(value) : item.quantity;
                    const unitPrice = field === 'unitPrice' ? Number(value) : item.unitPrice;
                    updatedItem.total = Number((quantity * unitPrice).toFixed(2));
                    updatedItem.quantity = quantity;
                    updatedItem.unitPrice = unitPrice;
                }
                return updatedItem;
            }
            return item;
        });
        return { ...prevData, items: newItems };
    });
  };
  
  const handleProductChange = (id: string, selectedProductName: string) => {
    setFormData(prevData => {
        const supplierProducts = prevData.identifiedSupplierCuit ? masterData.get(prevData.identifiedSupplierCuit)?.products : [];
        const selectedProduct = supplierProducts?.find(p => p.productName === selectedProductName);
        
        if (selectedProduct) {
            const newItems = prevData.items.map(item =>
                item.id === id ? { ...item, productName: selectedProduct.productName, productCode: selectedProduct.productCode } : item
            );
            return { ...prevData, items: newItems };
        }
        return prevData;
    });
  }

  const addNewItem = () => {
    const newItem: LineItem = {
      id: `item-manual-${Date.now()}`,
      ocrDescription: 'Entrada Manual',
      ocrQuantity: 0,
      ocrUnitPrice: 0,
      productCode: '',
      productName: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    setFormData(prevData => ({ ...prevData, items: [...prevData.items, newItem] }));
  }

  const removeItem = (id: string) => {
    setFormData(prevData => ({ ...prevData, items: prevData.items.filter(item => item.id !== id) }));
  }
  
  const identifiedSupplier = formData.identifiedSupplierCuit ? masterData.get(formData.identifiedSupplierCuit) : null;
  const supplierProducts = identifiedSupplier ? identifiedSupplier.products : [];
  const uniqueSupplierProducts = supplierProducts.filter((product, index, self) =>
    index === self.findIndex((p) => p.productName === product.productName)
  );

  return (
    <div className="bg-white p-4 rounded-lg shadow-lg flex flex-col h-full">
      <h2 className="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Datos Extraídos y Mapeados</h2>
      
      <div className="flex-grow overflow-y-auto pr-2">
        {/* Header Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <InputField label="Nº de Comprobante" name="invoiceNumber" value={formData.invoiceNumber} onChange={handleHeaderChange} />
          <InputField label="Fecha de Factura" name="invoiceDate" type="date" value={formData.invoiceDate} onChange={handleHeaderChange} />
        </div>

        {/* Supplier Section */}
        <div className="p-4 bg-slate-50 rounded-lg mb-4">
          <h3 className="text-lg font-semibold mb-2 text-slate-600">Información del Proveedor</h3>
          {identifiedSupplier ? (
             <div className="flex items-center justify-between">
                <p><span className="font-semibold">Identificado:</span> {identifiedSupplier.supplierName} (CUIT: {formData.identifiedSupplierCuit})</p>
                 <button onClick={() => setFormData(prev => ({ ...prev, identifiedSupplierCuit: undefined }))} className="text-sm text-indigo-600 hover:underline">Cambiar</button>
             </div>
          ) : (
             <div>
                <label htmlFor="supplier-search" className="block text-sm font-medium text-slate-700">Proveedor no identificado. Por favor, selecciona:</label>
                <input
                    type="text"
                    id="supplier-search"
                    placeholder="Buscar proveedor por nombre o CUIT..."
                    value={supplierSearchTerm}
                    onChange={e => setSupplierSearchTerm(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
                <select 
                    id="supplier-select" 
                    onChange={handleSupplierChange} 
                    value="" 
                    className="mt-2 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                    <option value="" disabled>-- Selecciona un Proveedor --</option>
                    {filteredSuppliers.map(s => <option key={s.cuit} value={s.cuit}>{s.name} - {s.cuit}</option>)}
                </select>
             </div>
          )}
        </div>
        
        {/* Pre-load Catalog Toggle */}
        {formData.identifiedSupplierCuit && (
          <div className="my-4 p-2 rounded-md bg-gray-100">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={formData.usePreloadedCatalog} onChange={handlePreloadToggle} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Precargar catálogo completo para este proveedor
            </label>
          </div>
        )}

        {/* Line Items Table */}
        <h3 className="text-lg font-semibold my-4 text-slate-600">Mapeo de Ítems</h3>
        <div className="flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-slate-300">
                <thead>
                  <tr className="text-left text-sm font-semibold text-slate-900">
                    <th scope="col" className="py-3.5 pl-4 pr-3 sm:pl-0 w-2/5">Descripción (OCR)</th>
                    <th scope="col" className="px-3 py-3.5 w-2/5">Producto (Sistema)</th>
                    <th scope="col" className="px-3 py-3.5">Cant.</th>
                    <th scope="col" className="px-3 py-3.5">Precio Unit.</th>
                    <th scope="col" className="px-3 py-3.5">Total</th>
                    <th scope="col" className="px-3 py-3.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {formData.items.map((item, index) => (
                    <tr key={item.id} className={`align-middle ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <td className="py-4 pl-4 pr-3 text-sm sm:pl-0">
                         <div className="font-medium text-slate-800">{item.ocrDescription || 'N/A'}</div>
                         <div className="text-xs text-slate-400 mt-1">(Qty: {item.ocrQuantity}, PU: {item.ocrUnitPrice})</div>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-500">
                         <select value={item.productName} onChange={e => handleProductChange(item.id, e.target.value)} className="w-full p-2 border rounded-md text-sm bg-white" disabled={!formData.identifiedSupplierCuit}>
                            <option value="N/A" disabled>{item.productCode ? item.productName : '-- Seleccionar Producto --'}</option>
                            {uniqueSupplierProducts.map(p => <option key={p.productName} value={p.productName}>{p.productName}</option>)}
                         </select>
                         <div className="text-xs text-slate-500 mt-1">Código: {item.productCode || 'N/A'}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                         <input type="number" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', e.target.value)} className="w-24 p-2 border rounded-md text-sm"/>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                         <input type="number" value={item.unitPrice} onChange={e => handleItemChange(item.id, 'unitPrice', e.target.value)} className="w-24 p-2 border rounded-md text-sm"/>
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500">
                          <input type="number" readOnly value={item.total} className="w-24 p-2 border rounded-md bg-slate-100 text-sm"/>
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-center text-sm font-medium sm:pr-0">
                        <button onClick={() => removeItem(item.id)} className="text-red-600 hover:text-red-900 p-1 rounded-full hover:bg-red-100"><TrashIcon className="w-5 h-5"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <button onClick={addNewItem} disabled={!formData.identifiedSupplierCuit} className="mt-2 text-sm text-indigo-600 font-semibold hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed">+ Añadir Nuevo Ítem</button>
      </div>
    </div>
  );
});

// Sub-component for form fields
interface InputFieldProps {
    label: string;
    name: string;
    value: string | number;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    type?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, name, value, onChange, type = 'text' }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-slate-700">{label}</label>
        <input
            type={type}
            id={name}
            name={name}
            value={value ?? ''}
            onChange={onChange}
            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
    </div>
);


export default DataForm;