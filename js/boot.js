// Zavaděč: načte Three.js (ES modul) a pak klasické skripty hry
import * as THREE from 'three';
import { Reflector } from '../lib/Reflector.js';
import { GLTFLoader } from '../lib/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../lib/meshopt_decoder.module.js';
import * as SkeletonUtils from '../lib/utils/SkeletonUtils.js';
import { EffectComposer } from '../lib/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/postprocessing/RenderPass.js';
import { ShaderPass } from '../lib/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../lib/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/postprocessing/OutputPass.js';
window.THREE = THREE;
window.Reflector = Reflector;
window.GLTFLoader = GLTFLoader;
window.MeshoptDecoder = MeshoptDecoder;
window.SkeletonUtils = SkeletonUtils;
window.PP = { EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass };

const msg = document.getElementById('msg');
const files = ['util', 'data', 'audio', 'input', 'game', 'game-lines', 'game-rules', 'game-actions', 'game-physics', 'game-ai', 'game-flow', 'football', 'led', 'render', 'touch', 'render3d', 'players3d', 'career', 'ach', 'update', 'app'];
try {
  for (const f of files) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/' + f + '.js'; s.charset = 'utf-8';
      s.onload = res; s.onerror = () => rej(new Error('Nelze načíst ' + f + '.js'));
      document.body.appendChild(s);
    });
  }
  msg.remove();
} catch (e) {
  msg.textContent = 'Chyba při načítání: ' + e.message;
}
