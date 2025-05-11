
import {
  ObjectDetector,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";


// Select DOM elements
const video = document.getElementById('video');
const alerts = document.getElementById('alerts');



// Initialize MediaPipe objects
let camera;
let faceMesh;
let hands;
let objectDetector;
let lastVideoTime = -1;

// Configure MediaPipe FaceMesh
function initFaceMesh() {
    faceMesh = new FaceMesh({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMesh.setOptions({
        maxNumFaces: 2,
        refineLandmarks: true,
        minDetectionConfidence: 0.8,
        minTrackingConfidence: 0.8,
    });

    faceMesh.onResults(handleFaceResults);
}



const initializeObjectDetector = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );
  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
      delegate: "GPU"
    },
    scoreThreshold: 0.5,
    runningMode: 'VIDEO',
  });
  return objectDetector;
};


const createAudioClassifier = async () => {
  const audio = await FilesetResolver.forAudioTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.0/wasm"
  );

  audioClassifier = await AudioClassifier.createFromOptions(audio, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite"
    }
  });
};


// Handle face results
function handleFaceResults(results) {
    if (!results.multiFaceLandmarks.length) {
        updateAlert('❌ No face detected');
        return;
    }

    if (results.multiFaceLandmarks.length > 1) {
        updateAlert('⚠️ Multiple faces detected');
        return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    const horizontalDiff = getHorizontalDiff(landmarks);
    const mouthOpen = checkMouthOpen(landmarks);

    if (horizontalDiff < 0.2) {
        updateAlert('⚠️ Head turned away');
    }

    // if (mouthOpen) {
    //     updateAlert('⚠️ Speaking without voice (mouth open)');
    // }
}

// Handle hand results
function handleHandResults(results) {
    if (results.multiHandLandmarks.length > 0) {
        updateAlert('⚠️ Hand detected – possible mobile/book use');
    }
}

function handleObjectDetectionResults(result) {
  if (!result || !result.detections) return;

  const detectedObjects = result.detections
      .map(d => d.categories[0]?.categoryName)
      .filter(Boolean);

  const messages = [];

  if (detectedObjects.includes('cell phone')) messages.push('📱 Cell phone detected');
  if (detectedObjects.includes('book')) messages.push('📖 Book detected');
 
  if (messages.length > 0) {
      updateAlert(messages);
  }
}


// Get cheek distance
function getHorizontalDiff(landmarks) {
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    return Math.abs(rightCheek.x - leftCheek.x);
}

// Detect mouth open
function checkMouthOpen(landmarks) {
    const upperLip = landmarks[13].y;
    const lowerLip = landmarks[14].y;
    return Math.abs(upperLip - lowerLip) > 0.02;
}





let alertTimeout;

// Update alert message for 2 seconds
function updateAlert(message) {
  alerts.innerText = message;

  if (alertTimeout) clearTimeout(alertTimeout);

  alertTimeout = setTimeout(() => {
    alerts.innerText = "";
  }, 2000);
}


async function initCamera() {
  camera = new Camera(video, {
      onFrame: async () => {
          await faceMesh.send({ image: video });
          // await hands.send({ image: video });

          let now = performance.now();
          if (video.currentTime !== lastVideoTime) {
              lastVideoTime = video.currentTime;
              const result = await objectDetector.detectForVideo(video, now);
              handleObjectDetectionResults(result);
          }
      },
      width: 640,
      height: 480,
  });

  camera.start();
 
}



async function startApp() {
  initFaceMesh();

  objectDetector = await initializeObjectDetector();
  
  await initCamera();

}


// Kick things off
startApp();
