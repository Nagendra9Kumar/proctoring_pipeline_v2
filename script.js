import { startProctoring } from './utils/proctoring.js';

const video = document.getElementById('video');
const alerts = document.getElementById('alerts');
const button = document.getElementById('start-button');

async function runProctoring() {
    const proctor = await startProctoring(video, (msg) => {
      alerts.textContent = msg;
    });
    button.addEventListener('click', () => {
      if (proctor.running) {
        proctor.stop();
        button.textContent = 'Start Proctoring';
        alerts.textContent = '';
      } else {
        proctor.start();
        button.textContent = 'Stop Proctoring';
      }
    });
  }

  runProctoring();