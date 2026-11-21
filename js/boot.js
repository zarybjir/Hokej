// Zavaděč: načte Three.js (ES modul) a pak klasické skripty hry
import * as THREE from 'three';
import { Reflector } from '../lib/Reflector.js';
window.THREE = THREE;
window.Reflector = Reflector;

const msg = document.getElementById('msg');
const files = ['util', 'data', 'audio', 'input', 'game', 'led', 'render', 'render3d', 'app'];
try {
  for (const f of files) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/' + f + '.js';
      s.onload = res; s.onerror = () => rej(new Error('Nelze načíst ' + f + '.js'));
      document.body.appendChild(s);
    });
  }
  msg.remove();
} catch (e) {
  msg.textContent = 'Chyba při načítání: ' + e.message;
}
