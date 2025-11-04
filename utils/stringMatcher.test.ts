
import { levenshteinDistance, findBestMatch } from './stringMatcher';

describe('stringMatcher', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should return the length of the other string if one is empty', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('hello', '')).toBe(5);
    });

    it('should calculate the correct distance for substitutions', () => {
      expect(levenshteinDistance('karin', 'barin')).toBe(1);
      expect(levenshteinDistance('apple', 'apply')).toBe(1);
    });

    it('should calculate the correct distance for insertions', () => {
      expect(levenshteinDistance('cat', 'cart')).toBe(1);
      expect(levenshteinDistance('dog', 'dogs')).toBe(1);
    });

    it('should calculate the correct distance for deletions', () => {
      expect(levenshteinDistance('apple', 'aple')).toBe(1);
      expect(levenshteinDistance('banana', 'banna')).toBe(1);
    });

    it('should be case-sensitive', () => {
      expect(levenshteinDistance('Hello', 'hello')).toBe(1);
    });
  });

  describe('findBestMatch', () => {
    const candidates = [
      { productCode: 'P001', productName: 'Delicious Apples' },
      { productCode: 'P002', productName: 'Fresh Bananas' },
      { productCode: 'P003', productName: 'Organic Carrots' },
    ];
    const keyExtractor = (p: { productName: string }) => p.productName;

    it('should find the best match for a given string', () => {
      const result = findBestMatch('Delicius Apples', candidates, keyExtractor);
      expect(result).not.toBeNull();
      expect(result?.bestMatch.productCode).toBe('P001');
    });

    it('should return null if no good match is found', () => {
      const result = findBestMatch('Random String', candidates, keyExtractor);
      expect(result).toBeNull();
    });

    it('should be case-insensitive in matching', () => {
      const result = findBestMatch('delicious apples', candidates, keyExtractor);
      expect(result).not.toBeNull();
      expect(result?.bestMatch.productCode).toBe('P001');
    });

    it('should handle empty target or candidates', () => {
      expect(findBestMatch('', candidates, keyExtractor)).toBeNull();
      expect(findBestMatch('apples', [], keyExtractor)).toBeNull();
    });

    it('should return the match with the highest score', () => {
      const newCandidates = [
        ...candidates,
        { productCode: 'P004', productName: 'Very Delicious Apples' },
      ];
      const result = findBestMatch('Delicious Apples', newCandidates, keyExtractor);
      expect(result?.bestMatch.productCode).toBe('P001');
    });
  });
});
