
// Calculates the Levenshtein distance between two strings. A lower number means more similar.
export function levenshteinDistance(a: string = '', b: string = ''): number {
    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;
    if (an === 0) {
        return bn;
    }
    if (bn === 0) {
        return an;
    }
    const matrix = new Array(bn + 1);
    for (let i = 0; i <= bn; ++i) {
        let row = matrix[i] = new Array(an + 1);
        row[0] = i;
    }
    const firstRow = matrix[0];
    for (let j = 1; j <= an; ++j) {
        firstRow[j] = j;
    }
    for (let i = 1; i <= bn; ++i) {
        for (let j = 1; j <= an; ++j) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }
    return matrix[bn][an];
}

// Normalize score to be between 0 and 1, where 1 is a perfect match.
function similarity(distance: number, len1: number, len2: number): number {
    const maxLen = Math.max(len1, len2);
    if (maxLen === 0) return 1;
    return 1 - distance / maxLen;
}

// Finds the best match for a target string from a list of candidate objects.
export function findBestMatch<T>(target: string, candidates: T[], keyExtractor: (candidate: T) => string): { bestMatch: T; score: number } | null {
    if (!target || candidates.length === 0) return null;
    const targetLower = target.toLowerCase();
    
    let bestMatch: T | null = null;
    let highScore = -1;

    for (const candidate of candidates) {
        const candidateText = keyExtractor(candidate);
        const candidateLower = candidateText.toLowerCase();
        const distance = levenshteinDistance(targetLower, candidateLower);
        const score = similarity(distance, targetLower.length, candidateLower.length);
        
        if (score > highScore) {
            highScore = score;
            bestMatch = candidate;
        }
    }
    
    // Set a threshold to avoid poor matches.
    if (bestMatch && highScore > 0.5) { 
        return { bestMatch, score: highScore };
    }
    return null;
}
