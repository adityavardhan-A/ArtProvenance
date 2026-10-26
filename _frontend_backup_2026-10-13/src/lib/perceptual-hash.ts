export async function generatePerceptualHash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      try {
        const size = 32;
        canvas.width = size;
        canvas.height = size;

        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = imageData.data;

        const grayscale: number[] = [];
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          grayscale.push(gray);
        }

        const dctHash = computeDCTHash(grayscale, size);
        resolve(dctHash);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
}

function computeDCTHash(grayscale: number[], size: number): string {
  const dctCoeffs: number[] = [];
  const dctSize = 8;

  for (let u = 0; u < dctSize; u++) {
    for (let v = 0; v < dctSize; v++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
          const pixel = grayscale[y * size + x];
          sum += pixel *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * size)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * size));
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dctCoeffs.push((cu * cv * sum) / 4);
    }
  }

  const medianCoeff = dctCoeffs.slice(1).sort((a, b) => a - b)[Math.floor(dctCoeffs.length / 2)];

  let hash = '';
  for (let i = 0; i < dctCoeffs.length; i++) {
    hash += dctCoeffs[i] > medianCoeff ? '1' : '0';
  }

  const hexHash = parseInt(hash, 2).toString(16).padStart(16, '0');
  return hexHash;
}

export function calculateHammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    return Infinity;
  }

  const bin1 = parseInt(hash1, 16).toString(2).padStart(64, '0');
  const bin2 = parseInt(hash2, 16).toString(2).padStart(64, '0');

  let distance = 0;
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) {
      distance++;
    }
  }

  return distance;
}

// Detect if image is likely a screenshot or resized image
export async function detectScreenshot(file: File): Promise<{ isScreenshot: boolean; confidence: number; reason: string }> {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve({ isScreenshot: false, confidence: 0, reason: 'Unable to analyze' });
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;

        console.log('📸 Screenshot Detection - Analyzing image:', { width: img.width, height: img.height, fileSize: file.size });

        let detectionScore = 0;
        const reasons: string[] = [];

        // ===== DETECTION 1: Common screen resolutions =====
        const screenResolutions = [
          { w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 1366, h: 768 }, 
          { w: 1024, h: 768 }, { w: 2560, h: 1440 }, { w: 3840, h: 2160 },
          { w: 1280, h: 720 }, { w: 1600, h: 1200 }, { w: 2880, h: 1800 }
        ];
        
        for (const res of screenResolutions) {
          if ((img.width === res.w && img.height === res.h) || 
              (img.width === res.h && img.height === res.w)) {
            detectionScore += 0.20;
            reasons.push(`Exact screen resolution: ${img.width}x${img.height}`);
            console.log('✓ Detected exact screen resolution');
            break;
          }
        }

        // ===== DETECTION 2: Common aspect ratios =====
        const aspectRatio = img.width / img.height;
        const commonRatios = [
          { ratio: 16/9, name: '16:9', tolerance: 0.01 },
          { ratio: 4/3, name: '4:3', tolerance: 0.01 },
          { ratio: 3/2, name: '3:2', tolerance: 0.01 },
          { ratio: 16/10, name: '16:10', tolerance: 0.01 }
        ];

        for (const ratio of commonRatios) {
          if (Math.abs(aspectRatio - ratio.ratio) < ratio.tolerance) {
            detectionScore += 0.15;
            reasons.push(`Standard ${ratio.name} aspect ratio`);
            console.log(`✓ Detected ${ratio.name} aspect ratio`);
            break;
          }
        }

        // ===== DETECTION 3: Unnatural pixel-level properties =====
        // Count truly unique RGB combinations
        const uniqueColors = new Set<string>();
        let totalPixels = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const key = `${r},${g},${b}`;
          uniqueColors.add(key);
          totalPixels++;
        }

        const colorDiversity = uniqueColors.size / totalPixels;
        console.log(`Color diversity: ${(colorDiversity * 100).toFixed(2)}% (${uniqueColors.size} unique colors)`);

        // Screenshots and UI have surprisingly low color diversity - but real photos also have low diversity
        // Only flag if EXTREMELY low (less than 3%)
        if (colorDiversity < 0.03) {
          detectionScore += 0.25;
          reasons.push(`Extremely low color diversity: only ${Math.round(colorDiversity * 100)}% unique colors`);
          console.log('✓ Detected extremely low color diversity (UI-like)');
        } else if (colorDiversity < 0.06) {
          detectionScore += 0.05;
          reasons.push(`Limited color palette detected`);
        }

        // ===== DETECTION 4: Edge detection - crisp UI vs soft artwork =====
        let totalEdgeStrength = 0;
        let edgePixels = 0;

        for (let y = 1; y < img.height - 1; y += 5) {
          for (let x = 1; x < img.width - 1; x += 5) {
            const idx = (y * img.width + x) * 4;
            const centerGray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            
            const rightIdx = (y * img.width + x + 1) * 4;
            const rightGray = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
            
            const bottomIdx = ((y + 1) * img.width + x) * 4;
            const bottomGray = 0.299 * data[bottomIdx] + 0.587 * data[bottomIdx + 1] + 0.114 * data[bottomIdx + 2];
            
            const edgeStrength = Math.abs(centerGray - rightGray) + Math.abs(centerGray - bottomGray);
            totalEdgeStrength += edgeStrength;
            if (edgeStrength > 80) edgePixels++;
          }
        }

        const avgEdgeStrength = totalEdgeStrength / (img.width * img.height / 25);
        const edgePixelRatio = edgePixels / (img.width * img.height / 25);
        console.log(`Edge strength: ${avgEdgeStrength.toFixed(2)}, Sharp pixels: ${(edgePixelRatio * 100).toFixed(2)}%`);

        // Only flag if VERY crisp edges (threshold raised from 120 to 180)
        if (avgEdgeStrength > 180) {
          detectionScore += 0.15;
          reasons.push('Unusually crisp edges (text/UI-like)');
          console.log('✓ Detected crisp edges');
        }

        // Only flag if VERY high sharp pixel ratio
        if (edgePixelRatio > 0.25) {
          detectionScore += 0.10;
          reasons.push('High number of sharp transitions');
          console.log('✓ Detected sharp transitions');
        }

        // ===== DETECTION 5: JPEG compression artifacts =====
        // Real artwork usually has smooth gradients, screenshots often have block-like compression
        const pixelsPerSample = Math.floor(img.width / 10) * Math.floor(img.height / 10);
        const samples = 100;
        let blockiness = 0;

        for (let i = 0; i < samples; i++) {
          const x = Math.floor(Math.random() * (img.width - 10));
          const y = Math.floor(Math.random() * (img.height - 10));
          
          let variance = 0;
          let mean = 0;
          const blockSize = 8;
          
          for (let by = 0; by < blockSize; by++) {
            for (let bx = 0; bx < blockSize; bx++) {
              const idx = ((y + by) * img.width + (x + bx)) * 4;
              const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              mean += gray;
            }
          }
          
          mean /= (blockSize * blockSize);
          
          for (let by = 0; by < blockSize; by++) {
            for (let bx = 0; bx < blockSize; bx++) {
              const idx = ((y + by) * img.width + (x + bx)) * 4;
              const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
              variance += Math.pow(gray - mean, 2);
            }
          }
          
          if (variance / (blockSize * blockSize) < 5) blockiness++;
        }

        const blockinessRatio = blockiness / samples;
        console.log(`Blockiness score: ${(blockinessRatio * 100).toFixed(2)}%`);

        if (blockinessRatio > 0.35) {
          detectionScore += 0.10;
          reasons.push('JPEG compression blockiness detected');
          console.log('✓ Detected compression artifacts');
        }

        console.log(`🔍 Final Detection Score: ${(detectionScore * 100).toFixed(1)}%`);
        console.log(`Reasons: ${reasons.join(', ')}`);

        // ADJUSTED THRESHOLD: Only flag if MULTIPLE indicators present and score is very high
        // Changed from 0.40 to 0.70 to avoid false positives on legitimate artwork
        const isScreenshot = detectionScore > 0.70;

        resolve({
          isScreenshot,
          confidence: Math.min(1, detectionScore),
          reason: reasons.length > 0 ? reasons.join('; ') : 'Unknown'
        });
      } catch (error) {
        console.error('Error in screenshot detection:', error);
        resolve({ isScreenshot: false, confidence: 0, reason: 'Error in analysis' });
      }
    };

    img.onerror = () => {
      resolve({ isScreenshot: false, confidence: 0, reason: 'Unable to load image' });
    };

    img.src = URL.createObjectURL(file);
  });
}

function detectEdges(imageData: ImageData): number[] {
  const { width, height, data } = imageData;
  const edges: number[] = [];

  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }

      edges.push(Math.sqrt(gx * gx + gy * gy));
    }
  }

  return edges;
}

export async function findSimilarArtwork(
  perceptualHash: string,
  allArtworks: Array<{ id: string; perceptual_hash: string | null; title: string; user_id: string }>
): Promise<{ artwork: any; distance: number; confidence: number } | null> {
  // More aggressive thresholds for better detection
  const strictThreshold = 12;    // Exact matches
  const moderateThreshold = 20;  // Similar images
  let closestMatch: { artwork: any; distance: number; confidence: number } | null = null;

  for (const artwork of allArtworks) {
    if (!artwork.perceptual_hash) continue;

    const distance = calculateHammingDistance(perceptualHash, artwork.perceptual_hash);

    // Consider it a match if hamming distance is low
    if (distance <= moderateThreshold) {
      const confidence = calculateConfidence(distance);

      // Always track the closest match
      if (!closestMatch || distance < closestMatch.distance) {
        closestMatch = { artwork, distance, confidence };
      }
    }
  }

  return closestMatch;
}

function calculateConfidence(hammingDistance: number): number {
  const maxBits = 64;
  const similarity = 1 - (hammingDistance / maxBits);
  return Math.max(0, Math.min(1, similarity));
}

export async function analyzeImageFeatures(file: File): Promise<{
  colorHistogram: number[];
  edgeFeatures: number[];
  textureFeatures: number[];
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      try {
        canvas.width = 256;
        canvas.height = 256;

        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        ctx.drawImage(img, 0, 0, 256, 256);
        const imageData = ctx.getImageData(0, 0, 256, 256);
        const pixels = imageData.data;

        const colorHistogram = computeColorHistogram(pixels);
        const edgeFeatures = computeEdgeFeatures(imageData);
        const textureFeatures = computeTextureFeatures(imageData);

        resolve({ colorHistogram, edgeFeatures, textureFeatures });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function computeColorHistogram(pixels: Uint8ClampedArray): number[] {
  const bins = 16;
  const histogram = new Array(bins * 3).fill(0);
  const binSize = 256 / bins;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = Math.floor(pixels[i] / binSize);
    const g = Math.floor(pixels[i + 1] / binSize);
    const b = Math.floor(pixels[i + 2] / binSize);

    histogram[r]++;
    histogram[bins + g]++;
    histogram[bins * 2 + b]++;
  }

  const total = pixels.length / 4;
  return histogram.map(count => count / total);
}

function computeEdgeFeatures(imageData: ImageData): number[] {
  const { width, height, data } = imageData;
  const edges: number[] = [];

  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray * sobelX[kernelIdx];
          gy += gray * sobelY[kernelIdx];
        }
      }

      edges.push(Math.sqrt(gx * gx + gy * gy));
    }
  }

  const histogram = new Array(10).fill(0);
  const maxEdge = Math.max(...edges);
  edges.forEach(edge => {
    const bin = Math.min(9, Math.floor((edge / maxEdge) * 10));
    histogram[bin]++;
  });

  return histogram.map(count => count / edges.length);
}

function computeTextureFeatures(imageData: ImageData): number[] {
  const { width, height, data } = imageData;
  const grayscale: number[] = [];

  for (let i = 0; i < data.length; i += 4) {
    grayscale.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  let variance = 0;
  const mean = grayscale.reduce((sum, val) => sum + val, 0) / grayscale.length;

  grayscale.forEach(val => {
    variance += Math.pow(val - mean, 2);
  });
  variance /= grayscale.length;

  return [mean / 255, Math.sqrt(variance) / 255];
}

export async function compareImageFeatures(
  features1: { colorHistogram: number[]; edgeFeatures: number[]; textureFeatures: number[] },
  features2: { colorHistogram: number[]; edgeFeatures: number[]; textureFeatures: number[] }
): Promise<number> {
  const colorSimilarity = cosineSimilarity(features1.colorHistogram, features2.colorHistogram);
  const edgeSimilarity = cosineSimilarity(features1.edgeFeatures, features2.edgeFeatures);
  const textureSimilarity = cosineSimilarity(features1.textureFeatures, features2.textureFeatures);

  return (colorSimilarity * 0.4 + edgeSimilarity * 0.4 + textureSimilarity * 0.2);
}

export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}