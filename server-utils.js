// /server-utils.js

// --- Helper para Reintentos ---
export const fetchWithRetry = async (fn, retries = 3, delay = 2000) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.status === 503) {
        console.log(`Intento ${i + 1} falló por sobrecarga. Reintentando en ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
};

// --- Helper para Reparar JSON ---
export function repairJson(jsonString) {
    return jsonString
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, '$1');
}

// --- Helper para Normalizar Datos ---
export const normalizeData = (data) => {
    const normalized = {};
    const findValue = (obj, keys) => {
        const lowerCaseKeys = keys.map(k => k.toLowerCase());
        for (const key in obj) {
            if (lowerCaseKeys.includes(key.toLowerCase())) return obj[key];
        }
        return undefined;
    };

    normalized.invoiceNumber = findValue(data, ['invoiceNumber', 'numero_factura', 'numero_comprobante']);
    normalized.invoiceDate = findValue(data, ['invoiceDate', 'fecha_factura']);
    normalized.supplierName = findValue(data, ['supplierName', 'emisor_nombre', 'nombre_emisor']);
    normalized.cuit = findValue(data, ['cuit', 'emisor_cuit', 'cuit_emisor']);
    normalized.totalAmount = findValue(data, ['totalAmount', 'importe_total']);
    normalized.ivaPerception = findValue(data, ['ivaPerception', 'percepcion_iva', 'percepciones_iva']);
    normalized.grossIncomePerception = findValue(data, ['grossIncomePerception', 'percepcion_ingresos_brutos']);
    
    // Formatear fecha
    if (normalized.invoiceDate && typeof normalized.invoiceDate === 'string') {
        const parts = normalized.invoiceDate.split('/');
        if (parts.length === 3) {
            normalized.invoiceDate = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
        }
    }

    const itemsArray = findValue(data, ['items']);
    if (Array.isArray(itemsArray)) {
        normalized.items = itemsArray.map(item => ({
            quantity: findValue(item, ['quantity', 'cantidad']),
            description: findValue(item, ['description', 'descripcion']),
            unitPrice: findValue(item, ['unitPrice', 'precio_unitario']),
            total: findValue(item, ['total', 'importe_total', 'importe_total_item', 'importe_total_linea'])
        }));
    }
    return normalized;
};