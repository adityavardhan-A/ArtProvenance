import { cosineSimilarity } from './perceptual-hash';

interface ImageFeatures {
  keypoints: Array<{ x: number; y: number; scale: number; orientation: number }>;
  descriptors: number[][];
  histogram: number[];
  edges: number[];
  colorMoments: { r: number; g: number; b: number }[];
  sharpness: number;
  blur: number;
  sift_hash: string;
}

const BLUR_THRESHOLD = 50;
const SHARPNESS_THRESHOLD = 100;

export async function extractAdvancedFeatures(file: File): Promise<ImageFeatures> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 512, 512);

        const imageData = ctx.getImageData(0, 0, 512, 512);

        const keypoints = detectKeypoints(imageData);
        const descriptors = computeDescriptors(imageData, keypoints);
        const histogram = computeColorHistogram(imageData);
        const edges = computeSobelEdges(imageData);
        const colorMoments = computeColorMoments(imageData);
        const sharpness = computeSharpness(imageData);
        const blur = detectBlur(imageData);
        const sift_hash = generateSIFTHash(descriptors);

        resolve({
          keypoints,
          descriptors,
          histogram,
          edges,
          colorMoments,
          sharpness,
          blur,
          sift_hash
        });
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function detectKeypoints(imageData: ImageData): Array<{ x: number; y: number; scale: number; orientation: number }> {
  const { width, height, data } = imageData;
  const keypoints: Array<{ x: number; y: number; scale: number; orientation: number }> = [];

  const gaussianPyramid = buildGaussianPyramid(imageData);

  for (let octave = 0; octave < gaussianPyramid.length - 1; octave++) {
    const octaveData = gaussianPyramid[octave];

    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const isKeypoint = isExtrema(octaveData, x, y, width, height);

        if (isKeypoint) {
          const scale = Math.pow(2, octave);
          const orientation = computeOrientation(octaveData, x, y, width, height);

          keypoints.push({
            x: x * scale,
            y: y * scale,
            scale,
            orientation
          });
        }
      }
    }
  }

  return keypoints.slice(0, 200);
}

function buildGaussianPyramid(imageData: ImageData, levels: number = 3): number[][][] {
  const { width, height, data } = imageData;
  const pyramid: number[][][] = [];

  let currentImage = extractGrayscale(data, width, height);

  for (let level = 0; level < levels; level++) {
    pyramid.push(currentImage);

    if (level < levels - 1) {
      currentImage = downSample(currentImage);
    }
  }

  return pyramid;
}

function extractGrayscale(data: Uint8ClampedArray, width: number, height: number): number[][] {
  const grayscale: number[][] = [];

  for (let y = 0; y < height; y++) {
    grayscale[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      grayscale[y][x] = gray;
    }
  }

  return grayscale;
}

function downSample(image: number[][]): number[][] {
  const newHeight = Math.floor(image.length / 2);
  const newWidth = Math.floor(image[0].length / 2);
  const downsampled: number[][] = [];

  for (let y = 0; y < newHeight; y++) {
    downsampled[y] = [];
    for (let x = 0; x < newWidth; x++) {
      const avg = (image[y * 2][x * 2] +
        image[y * 2][x * 2 + 1] +
        image[y * 2 + 1][x * 2] +
        image[y * 2 + 1][x * 2 + 1]) / 4;
      downsampled[y][x] = avg;
    }
  }

  return downsampled;
}

function isExtrema(image: number[][], x: number, y: number, width: number, height: number): boolean {
  const center = image[y][x];
  let isMax = true;
  let isMin = true;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const val = image[y + dy]?.[x + dx] ?? 0;
      if (val >= center) isMax = false;
      if (val <= center) isMin = false;
    }
  }

  return (isMax || isMin) && Math.abs(center) > 10;
}

function computeOrientation(image: number[][], x: number, y: number, width: number, height: number): number {
  let sumX = 0;
  let sumY = 0;
  const radius = 5;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = x + dx;
      const py = y + dy;

      if (px > 0 && px < width - 1 && py > 0 && py < height - 1) {
        const gx = (image[py][px + 1] ?? 0) - (image[py][px - 1] ?? 0);
        const gy = (image[py + 1]?.[px] ?? 0) - (image[py - 1]?.[px] ?? 0);

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const angle = Math.atan2(gy, gx);

        sumX += magnitude * Math.cos(angle);
        sumY += magnitude * Math.sin(angle);
      }
    }
  }

  return Math.atan2(sumY, sumX);
}

function computeDescriptors(imageData: ImageData, keypoints: Array<{ x: number; y: number; scale: number; orientation: number }>): number[][] {
  const { width, height, data } = imageData;
  const grayscale = extractGrayscale(data, width, height);
  const descriptors: number[][] = [];

  for (const kp of keypoints) {
    const x = Math.round(kp.x);
    const y = Math.round(kp.y);
    const descriptor: number[] = [];

    const patchSize = 16;
    for (let dy = -patchSize; dy <= patchSize; dy++) {
      for (let dx = -patchSize; dx <= patchSize; dx++) {
        const px = x + dx;
        const py = y + dy;

        if (px > 0 && px < width && py > 0 && py < height) {
          const gx = (grayscale[py][px + 1] ?? 0) - (grayscale[py][px - 1] ?? 0);
          const gy = (grayscale[py + 1]?.[px] ?? 0) - (grayscale[py - 1]?.[px] ?? 0);

          descriptor.push(Math.sqrt(gx * gx + gy * gy));
        }
      }
    }

    descriptors.push(descriptor);
  }

  return descriptors;
}

function generateSIFTHash(descriptors: number[][]): string {
  let hash = '';

  for (const descriptor of descriptors.slice(0, 10)) {
    const mean = descriptor.reduce((a, b) => a + b, 0) / descriptor.length;
    hash += descriptor.map(v => v > mean ? '1' : '0').join('');
  }

  const trimmed = hash.substring(0, 64);
  const hex = parseInt(trimmed.padEnd(64, '0'), 2).toString(16).padStart(16, '0');
  return hex;
}

function computeColorHistogram(imageData: ImageData): number[] {
  const { data } = imageData;
  const histogram = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    histogram[Math.floor(gray)]++;
  }

  const max = Math.max(...histogram);
  return histogram.map(v => v / max);
}

function computeSobelEdges(imageData: ImageData): number[] {
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

  const histogram = new Array(32).fill(0);
  const maxEdge = Math.max(...edges);
  edges.forEach(edge => {
    const bin = Math.min(31, Math.floor((edge / maxEdge) * 32));
    histogram[bin]++;
  });

  return histogram.map(v => v / edges.length);
}

function computeColorMoments(imageData: ImageData): Array<{ r: number; g: number; b: number }> {
  const { data } = imageData;
  const moments: Array<{ r: number; g: number; b: number }> = [];

  const regions = 9;
  const regionSize = Math.sqrt(data.length / 16 / regions);

  for (let region = 0; region < regions; region++) {
    let sumR = 0, sumG = 0, sumB = 0;
    let count = 0;
    const start = Math.floor(region * regionSize * 4);
    const end = Math.floor(start + regionSize * 4);

    for (let i = start; i < Math.min(end, data.length); i += 4) {
      sumR += data[i];
      sumG += data[i + 1];
      sumB += data[i + 2];
      count++;
    }

    moments.push({
      r: sumR / count / 255,
      g: sumG / count / 255,
      b: sumB / count / 255
    });
  }

  return moments;
}

function computeSharpness(imageData: ImageData): number {
  const { width, height, data } = imageData;
  let sharpness = 0;

  for (let i = 0; i < data.length - 4; i += 4) {
    const gray1 = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const gray2 = 0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6];
    sharpness += Math.abs(gray1 - gray2);
  }

  return sharpness / (data.length / 4);
}

function detectBlur(imageData: ImageData): number {
  const { data } = imageData;
  let blur = 0;
  let count = 0;

  for (let i = 0; i < data.length - 8; i += 8) {
    const gray1 = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const gray2 = 0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6];
    const diff = Math.abs(gray1 - gray2);
    blur += diff < 10 ? 1 : 0;
    count++;
  }

  return blur / count;
}

export async function compareForgeryRisk(
  features1: ImageFeatures,
  features2: ImageFeatures
): Promise<{ riskScore: number; analysis: string; detectionType: string }> {
  // Validate that both feature sets have necessary data
  if (!features1 || !features2) {
    return {
      riskScore: 0,
      analysis: 'Unable to compare features',
      detectionType: 'Error'
    };
  }

  const weights = {
    descriptor: 0.35,
    histogram: 0.20,
    edges: 0.20,
    colorMoments: 0.10,
    blur: 0.10,
    sharpness: 0.05
  };

  // Only compute similarities if we have valid data
  let descriptorSimilarity = 0;
  let histogramSimilarity = 0;
  let edgeSimilarity = 0;
  let colorMomentsSimilarity = 0;

  if (features1.descriptors?.length > 0 && features2.descriptors?.length > 0) {
    descriptorSimilarity = compareDescriptors(features1.descriptors, features2.descriptors);
  }
  
  if (features1.histogram?.length > 0 && features2.histogram?.length > 0) {
    histogramSimilarity = cosineSimilarity(features1.histogram, features2.histogram);
  }
  
  if (features1.edges?.length > 0 && features2.edges?.length > 0) {
    edgeSimilarity = cosineSimilarity(features1.edges, features2.edges);
  }
  
  if (features1.colorMoments?.length > 0 && features2.colorMoments?.length > 0) {
    colorMomentsSimilarity = compareColorMoments(features1.colorMoments, features2.colorMoments);
  }

  const blurDifference = Math.abs(features1.blur - features2.blur);
  const sharpnessDifference = Math.abs(features1.sharpness - features2.sharpness);

  const riskScore =
    descriptorSimilarity * weights.descriptor +
    histogramSimilarity * weights.histogram +
    edgeSimilarity * weights.edges +
    colorMomentsSimilarity * weights.colorMoments +
    (1 - blurDifference) * weights.blur +
    (1 - Math.min(1, sharpnessDifference / 100)) * weights.sharpness;

  let detectionType = 'Original';
  let analysis = 'No forgery detected';

  // More conservative thresholds with better classification
  if (riskScore > 0.92) {
    detectionType = 'Exact Copy/Screenshot';
    analysis = 'This appears to be an exact duplicate, screenshot, or near-identical copy of the original artwork.';
  } else if (riskScore > 0.85) {
    detectionType = 'Screenshot/Resized';
    analysis = 'This appears to be a screenshot or resized version of the original artwork - significant match detected.';
  } else if (riskScore > 0.78) {
    detectionType = 'Color-Graded/Edited';
    analysis = 'This artwork appears to have color adjustments or minor edits but shares strong similarities.';
  } else if (riskScore > 0.70) {
    detectionType = 'Heavily Modified';
    analysis = 'This artwork shows significant modifications but shares structural similarities.';
  } else if (riskScore > 0.60) {
    detectionType = 'Derivative Work';
    analysis = 'This may be based on the original but has substantial changes.';
  }

  return {
    riskScore: Math.min(1, Math.max(0, riskScore)),
    analysis,
    detectionType
  };
}

function compareDescriptors(desc1: number[][], desc2: number[][]): number {
  if (desc1.length === 0 || desc2.length === 0) return 0;

  let matches = 0;
  const maxMatches = Math.min(desc1.length, desc2.length);

  for (let i = 0; i < Math.min(desc1.length, 50); i++) {
    const minDist = Math.min(...desc2.map(d => euclideanDistance(desc1[i], d)));
    if (minDist < 100) matches++;
  }

  return matches / maxMatches;
}

function euclideanDistance(vec1: number[], vec2: number[]): number {
  let sum = 0;
  const len = Math.min(vec1.length, vec2.length);
  for (let i = 0; i < len; i++) {
    sum += Math.pow(vec1[i] - vec2[i], 2);
  }
  return Math.sqrt(sum);
}

function compareColorMoments(moments1: Array<{ r: number; g: number; b: number }>, moments2: Array<{ r: number; g: number; b: number }>): number {
  if (moments1.length === 0 || moments2.length === 0) return 0;

  const len = Math.min(moments1.length, moments2.length);
  let similarity = 0;

  for (let i = 0; i < len; i++) {
    const dr = Math.abs(moments1[i].r - moments2[i].r);
    const dg = Math.abs(moments1[i].g - moments2[i].g);
    const db = Math.abs(moments1[i].b - moments2[i].b);
    similarity += 1 - (dr + dg + db) / 3;
  }

  return similarity / len;
}
