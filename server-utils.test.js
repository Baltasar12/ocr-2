
import { repairJson, normalizeData } from './server-utils.js';

describe('server-utils', () => {
  describe('repairJson', () => {
    it('should add double quotes to keys', () => {
      const brokenJson = '{key: "value"}';
      const fixedJson = '"key"';
      expect(repairJson(brokenJson)).toContain(fixedJson);
    });

    it('should replace single quotes with double quotes', () => {
      const brokenJson = "{'key': 'value'}";
      const fixedJson = '{"key": "value"}';
      expect(repairJson(brokenJson)).toBe(fixedJson);
    });

    it('should remove trailing commas from objects', () => {
      const brokenJson = '{"key": "value",}';
      const fixedJson = '{"key": "value"}';
      expect(repairJson(brokenJson)).toBe(fixedJson);
    });

    it('should remove trailing commas from arrays', () => {
      const brokenJson = '{"key": ["value",]}';
      const fixedJson = '{"key": ["value"]}';
      expect(repairJson(brokenJson)).toBe(fixedJson);
    });
  });

  describe('normalizeData', () => {
    it('should normalize different key names', () => {
      const rawData = {
        numero_factura: '123',
        fecha_factura: '10/12/2023',
        emisor_nombre: 'Test Supplier',
        emisor_cuit: '30-12345678-9',
        importe_total: 100,
        percepcion_iva: 10,
        percepcion_ingresos_brutos: 5,
        items: [
          {
            cantidad: 2,
            descripcion: 'Test Item',
            precio_unitario: 25,
            importe_total_item: 50,
          },
        ],
      };

      const normalizedData = normalizeData(rawData);

      expect(normalizedData).toHaveProperty('invoiceNumber', '123');
      expect(normalizedData).toHaveProperty('invoiceDate', '2023-12-10');
      expect(normalizedData).toHaveProperty('supplierName', 'Test Supplier');
      expect(normalizedData).toHaveProperty('cuit', '30-12345678-9');
      expect(normalizedData).toHaveProperty('totalAmount', 100);
      expect(normalizedData).toHaveProperty('ivaPerception', 10);
      expect(normalizedData).toHaveProperty('grossIncomePerception', 5);
      expect(normalizedData.items[0]).toHaveProperty('quantity', 2);
      expect(normalizedData.items[0]).toHaveProperty('description', 'Test Item');
      expect(normalizedData.items[0]).toHaveProperty('unitPrice', 25);
      expect(normalizedData.items[0]).toHaveProperty('total', 50);
    });

    it('should handle missing optional fields', () => {
      const rawData = {
        invoiceNumber: '123',
        items: [],
      };

      const normalizedData = normalizeData(rawData);
      expect(normalizedData).toHaveProperty('invoiceNumber', '123');
      expect(normalizedData.totalAmount).toBeUndefined();
    });

    it('should format date from DD/MM/YYYY to YYYY-MM-DD', () => {
        const rawData = { invoiceDate: '15/07/2023' };
        const normalizedData = normalizeData(rawData);
        expect(normalizedData.invoiceDate).toBe('2023-07-15');
    });
  });
});
