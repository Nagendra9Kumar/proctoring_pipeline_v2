import {
  ObjectDetector,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2";
await import("https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh");

export class Proctoring {
  constructor(videoElement, alertCallback) {
    this.video = videoElement;
    this.alertCallback = alertCallback;

    this.faceMesh = null;
    this.objectDetector = null;
    this.lastVideoTime = -1;
    this.alertTimeout = null;

    this.stream = null;
    this.running = false;

    this.headTurnStart = null;
    this.headTurnAlerted = false;
  }

  async start() {
    this.initFaceMesh();
    await this.initObjectDetector();
    await this.initCamera();
    this.running = true;
    this.processFrame();
  }

  initFaceMesh() {
    this.faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });

    this.faceMesh.onResults(this.handleFaceResults.bind(this));
  }

  async initObjectDetector() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
    );

    this.objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
        delegate: "GPU",
      },
      scoreThreshold: 0.5,
      runningMode: "VIDEO",
    });
  }

  async initCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
    } catch (error) {
      console.error("Camera initialization failed:", error);
      this.showAlert("❌ Cannot access camera");
    }
  }

  async processFrame() {
    if (!this.running) return;

    await this.faceMesh.send({ image: this.video });

    const now = performance.now();
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = await this.objectDetector.detectForVideo(this.video, now);
      this.handleObjectDetectionResults(result);
    }

    requestAnimationFrame(this.processFrame.bind(this));
  }

  handleFaceResults(results) {
    if (
      !results.multiFaceLandmarks ||
      results.multiFaceLandmarks.length === 0
    ) {
      this.showAlert("❌ No face detected");
      return;
    }

    if (results.multiFaceLandmarks.length > 1) {
      this.showAlert("⚠️ Multiple faces detected");
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    const horizontalDiff = this.getHorizontalDiff(landmarks);
    const mouthOpen = this.checkMouthOpen(landmarks);

    const headTurned = horizontalDiff < 0.2;

    if (headTurned) {
      const now = Date.now();
      if (!this.headTurnStart) {
        this.headTurnStart = now;
      }
      if (!this.headTurnAlerted && now - this.headTurnStart >= 1000) {
        this.showAlert("⚠️ Head turned away");
        this.headTurnAlerted = true;
      }
    } else {
      this.headTurnStart = null;
      this.headTurnAlerted = false;
    }

    if (mouthOpen) {
      // Show mouth open alert with a 3-second timeout
      if (this.alertTimeout) clearTimeout(this.alertTimeout);
      this.alertCallback("⚠️ Mouth open (possible speaking)");
      this.alertTimeout = setTimeout(() => {
        this.alertCallback("");
      }, 3000); // 3 seconds instead of default 2 seconds
    }
  }

  handleObjectDetectionResults(result) {
    if (!result || !result.detections) return;

    const detectedObjects = result.detections
      .map((d) => d.categories[0]?.categoryName)
      .filter(Boolean);

    const messages = [];

    const personCount = detectedObjects.filter(
      (obj) => obj === "person"
    ).length;

    if (personCount > 1) {
      messages.push("⚠️ Multiple persons detected");
    }

    if (detectedObjects.includes("cell phone"))
      messages.push("📱 Cell phone detected");

    if (detectedObjects.includes("book")) messages.push("📖 Book detected");

    if (messages.length > 0) {
      this.showAlert(messages.join(", "));
    }
  }

  getHorizontalDiff(landmarks) {
    const left = landmarks[234];
    const right = landmarks[454];
    return Math.abs(right.x - left.x);
  }

  checkMouthOpen(landmarks) {
    const upperLip = landmarks[13].y;
    const lowerLip = landmarks[14].y;
    return Math.abs(upperLip - lowerLip) > 0.02;
  }

  showAlert(message) {
    console.log(message);
    this.alertCallback(message);
  }

  stop() {
    this.running = false;

    // Stop all video tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        if (track.readyState === "live") {
          track.stop();
        }
      });
      this.stream = null;
    }

    // Clear alert timeout if any
    if (this.alertTimeout) {
      clearTimeout(this.alertTimeout);
      this.alertTimeout = null;
    }

    // Optionally pause video and remove stream
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }
}

export async function startProctoring(videoElement, alertCallback) {
  const proctor = new Proctoring(videoElement, alertCallback);
  return proctor;
}
