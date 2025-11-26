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
    <div className="bg-slate-50 p-6 rounded-2xl shadow-inner flex flex-col h-full border border-slate-200">
      <h2 className="text-2xl font-bold mb-4 text-slate-800 border-b border-slate-200 pb-3">Datos de la Factura</h2>
      
      <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
        {/* Header Data */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <InputField label="Nº de Comprobante" name="invoiceNumber" value={formData.invoiceNumber} onChange={handleHeaderChange} />
          <InputField label="Fecha de Factura" name="invoiceDate" type="date" value={formData.invoiceDate} onChange={handleHeaderChange} />
        </div>

        {/* Supplier Section */}
        <div className="p-4 bg-white rounded-xl mb-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-semibold mb-3 text-slate-800">Proveedor</h3>
          {identifiedSupplier ? (
             <div className="flex items-center justify-between bg-violet-50 p-3 rounded-lg">
                <div>
                    <p className="font-semibold text-violet-800">{identifiedSupplier.supplierName}</p>
                    <p className="text-sm text-slate-600">CUIT: {formData.identifiedSupplierCuit}</p>
                </div>
                 <button onClick={() => setFormData(prev => ({ ...prev, identifiedSupplierCuit: undefined }))} className="text-sm font-semibold text-violet-600 hover:text-violet-800 transition-colors">Cambiar</button>
             </div>
          ) : (
             <div>
                <label htmlFor="supplier-search" className="block text-sm font-medium text-slate-600 mb-1">Buscar y seleccionar proveedor:</label>
                <input
                    type="text"
                    id="supplier-search"
                    placeholder="Buscar por nombre o CUIT..."
                    value={supplierSearchTerm}
                    onChange={e => setSupplierSearchTerm(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 sm:text-sm transition-colors"
                />
                <select 
                    id="supplier-select" 
                    onChange={handleSupplierChange} 
                    value="" 
                    className="mt-2 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-violet-500 focus:border-violet-500 sm:text-sm rounded-lg transition-colors"
                    >
                    <option value="" disabled>-- Selecciona un Proveedor --</option>
                    {filteredSuppliers.map(s => <option key={s.cuit} value={s.cuit}>{s.name} - {s.cuit}</option>)}
                </select>
             </div>
          )}
        </div>
        
        {/* Pre-load Catalog Toggle */}
        {formData.identifiedSupplierCuit && (
          <div className="my-4 p-3 rounded-lg bg-slate-100 border border-slate-200">
            <label className="flex items-center gap-3 text-sm text-slate-700 font-medium">
              <input type="checkbox" checked={formData.usePreloadedCatalog} onChange={handlePreloadToggle} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
              Precargar catálogo completo para este proveedor
            </label>
          </div>
        )}

        {/* Line Items Table */}
        <h3 className="text-lg font-semibold my-4 text-slate-800">Ítems de la Factura</h3>
        <div className="flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-slate-200 border-b border-slate-200">
                <thead className="bg-slate-100">
                  <tr className="text-left text-sm font-semibold text-slate-600">
                    <th scope="col" className="py-3 pl-4 pr-3 sm:pl-2 w-2/5">Descripción (OCR)</th>
                    <th scope="col" className="px-3 py-3 w-2/5">Producto (Sistema)</th>
                    <th scope="col" className="px-3 py-3">Cant.</th>
                    <th scope="col" className="px-3 py-3">P. Unit.</th>
                    <th scope="col" className="px-3 py-3">Total</th>
                    <th scope="col" className="relative py-3 pl-3 pr-4 sm:pr-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {formData.items.map((item) => (
                    <tr key={item.id} className="align-top hover:bg-slate-50 transition-colors">
                      <td className="py-4 pl-4 pr-3 text-sm sm:pl-2">
                         <div className="font-medium text-slate-800">{item.ocrDescription || 'N/A'}</div>
                         <div className="text-xs text-slate-400 mt-1">(Detectado: Qty: {item.ocrQuantity}, PU: {item.ocrUnitPrice})</div>
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-500">
                         <select value={item.productName} onChange={e => handleProductChange(item.id, e.target.value)} className="w-full p-2 border-slate-300 rounded-lg text-sm bg-white focus:ring-violet-500 focus:border-violet-500 transition-colors" disabled={!formData.identifiedSupplierCuit}>
                            <option value="N/A" disabled>{item.productCode ? item.productName : '-- Seleccionar --'}</option>
                            {uniqueSupplierProducts.map(p => <option key={p.productName} value={p.productName}>{p.productName}</option>)}
                         </select>
                         <div className="text-xs text-slate-500 mt-1">Código: {item.productCode || 'N/A'}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                         <input type="number" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', e.target.value)} className="w-24 p-2 border-slate-300 rounded-lg text-sm focus:ring-violet-500 focus:border-violet-500"/>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                         <input type="number" value={item.unitPrice} onChange={e => handleItemChange(item.id, 'unitPrice', e.target.value)} className="w-24 p-2 border-slate-300 rounded-lg text-sm focus:ring-violet-500 focus:border-violet-500"/>
                      </td>
                       <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <input type="number" readOnly value={item.total} className="w-24 p-2 border-slate-300 rounded-lg bg-slate-100 text-sm"/>
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-center text-sm font-medium sm:pr-2">
                        <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100 transition-colors"><TrashIcon className="w-5 h-5"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <button onClick={addNewItem} disabled={!formData.identifiedSupplierCuit} className="mt-4 px-4 py-2 text-sm bg-violet-100 text-violet-700 font-semibold rounded-lg hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">+ Añadir Ítem Manual</button>
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
        <label htmlFor={name} className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
        <input
            type={type}
            id={name}
            name={name}
            value={value ?? ''}
            onChange={onChange}
            className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-violet-500 focus:border-violet-500 sm:text-sm transition-colors"
        />
    </div>
);


export default DataForm;