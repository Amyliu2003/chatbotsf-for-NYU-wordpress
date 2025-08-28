import fs from 'fs';
import path from 'path';

const VECTORS = path.join('data', 'vectors.json');
const SIGS    = path.join('data', 'signatures.json');

export const loadVectors = () => fs.existsSync(VECTORS) ? JSON.parse(fs.readFileSync(VECTORS,'utf8')) : [];
export const saveVectors = (arr) => {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(VECTORS, JSON.stringify(arr, null, 2));
};
export const loadSigs = () => fs.existsSync(SIGS) ? JSON.parse(fs.readFileSync(SIGS,'utf8')) : {};
export const saveSigs = (obj) => {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(SIGS, JSON.stringify(obj, null, 2));
};

export function cosine(a, b) {
  let dot=0, na=0, nb=0;
  for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) + 1e-8);
}

export function topK(queryVec, k=5) {
  const vecs = loadVectors();
  return vecs
    .map(v => ({...v, score: cosine(queryVec, v.values)}))
    .sort((x,y)=>y.score-x.score)
    .slice(0,k);
}
